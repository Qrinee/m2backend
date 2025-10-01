const express = require('express');
const User = require('../models/User');
const { auth, adminAuth } = require('../middleware/auth');
const router = express.Router();

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
router.get('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Użytkownik nie znaleziony'
      });
    }

    // Zwykły użytkownik może zobaczyć tylko swój profil, admin wszystkich
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        error: 'Brak uprawnień do przeglądania tego profilu'
      });
    }

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
    const { name, surname, phone, role, isActive } = req.body;
    
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

    // Tylko admin może zmieniać role i status aktywności
    if (req.user.role === 'admin') {
      if (role) updateData.role = role;
      if (isActive !== undefined) updateData.isActive = isActive;
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