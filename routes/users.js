const express = require('express');
const User = require('../models/User');
const { auth, adminAuth } = require('../middleware/auth');
const upload = require('../middleware/upload'); // Import multer
const fs = require('fs');
const path = require('path');
const router = express.Router();


router.get('/team/admins', async (req, res) => {
  try {
    const adminUsers = await User.find({ 
      role: 'admin', 
      isActive: true 
    })
    .select('-password -email') // Wyklucz hasło i email
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        users: adminUsers,
        total: adminUsers.length
      }
    });
  } catch (error) {
    console.error('Błąd pobierania adminów:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas pobierania zespołu'
    });
  }
});


// Pobierz wszystkich użytkowników (tylko admin)
router.get('/', adminAuth, async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        users,
        total: users.length
      }
    });
  } catch (error) {
    console.error('Błąd pobierania użytkowników:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas pobierania użytkowników'
    });
  }
});

// Pobierz użytkownika po ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Użytkownik nie znaleziony'
      });
    }

    // Jeśli profil należy do admina → każdy może zobaczyć wybrane pola
    if (user.role === 'admin') {
      const publicData = {
        name: user.name,
        surname: user.surname,
        position: user.position,
        profilePicture: user.profilePicture,
        phone: user.phone,
        contactEmail: user.contactEmail,
        bio: user.bio
      };

      return res.json({
        success: true,
        data: { user: publicData }
      });
    }

    // Jeśli nie admin:
    // zwykły użytkownik widzi tylko swój profil
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        error: 'Brak uprawnień do przeglądania tego profilu'
      });
    }

    // Admin widzi pełne dane zwykłego użytkownika
    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Błąd pobierania użytkownika:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas pobierania użytkownika'
    });
  }
});

// Aktualizuj użytkownika (admin lub właściciel konta)
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, surname, phone, contactEmail, position, bio, profilePicture } = req.body;
    
    // Sprawdź uprawnienia
    if (req.user._id.toString() !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Brak uprawnień do aktualizacji tego profilu'
      });
    }

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (surname) updateData.surname = surname.trim();
    if (phone !== undefined) updateData.phone = phone;
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail;
    if (position !== undefined) updateData.position = position;
    if (bio !== undefined) updateData.bio = bio;
    if (profilePicture !== undefined) updateData.profilePicture = profilePicture;

    // Tylko admin może zmieniać role i status aktywności
    if (req.user.role === 'admin') {
      if (req.body.role) updateData.role = req.body.role;
      if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Użytkownik nie znaleziony'
      });
    }

    res.json({
      success: true,
      message: 'Profil użytkownika został zaktualizowany',
      data: { user }
    });

  } catch (error) {
    console.error('Błąd aktualizacji użytkownika:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: errors.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas aktualizacji użytkownika'
    });
  }
});

// Upload obrazka profilowego
router.post('/:id/upload', auth, upload.single('image'), async (req, res) => {
  try {
    // Sprawdź uprawnienia
    if (req.user._id.toString() !== req.params.id && req.user.role !== 'admin') {
      // Usuń przesłany plik jeśli brak uprawnień
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(403).json({
        success: false,
        error: 'Brak uprawnień do aktualizacji tego profilu'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Nie wybrano pliku'
      });
    }

    // Sprawdź czy to obrazek
    if (!req.file.mimetype.startsWith('image/')) {
      // Usuń plik jeśli to nie obrazek
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'Dozwolone są tylko pliki obrazów (JPEG, PNG, GIF)'
      });
    }

    // Sprawdź rozmiar pliku (max 5MB)
    if (req.file.size > 5 * 1024 * 1024) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'Plik jest zbyt duży. Maksymalny rozmiar to 5MB.'
      });
    }

    // URL do przesłanego obrazka
    const imageUrl = `/uploads/${req.file.filename}`;

    // Aktualizuj użytkownika
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { profilePicture: imageUrl },
      { new: true }
    ).select('-password');

    if (!user) {
      // Usuń plik jeśli użytkownik nie istnieje
      fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        error: 'Użytkownik nie znaleziony'
      });
    }

    res.json({
      success: true,
      message: 'Zdjęcie profilowe zostało zaktualizowane',
      data: {
        user,
        imageUrl: imageUrl
      }
    });

  } catch (error) {
    // Usuń plik w przypadku błędu
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Błąd uploadu obrazka:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas uploadu obrazka'
    });
  }
});

// Usuń użytkownika (tylko admin)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Użytkownik nie znaleziony'
      });
    }

    res.json({
      success: true,
      message: 'Użytkownik został usunięty'
    });

  } catch (error) {
    console.error('Błąd usuwania użytkownika:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas usuwania użytkownika'
    });
  }
});

module.exports = router;