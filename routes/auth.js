const express = require('express');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Rejestracja użytkownika
router.post('/register', async (req, res) => {
  try {
    const { name, surname, email, password, phone } = req.body;

    // Walidacja pól
    if (!name || !surname || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Wymagane pola: name, surname, email, password'
      });
    }

    // Sprawdź czy użytkownik już istnieje
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Użytkownik z tym adresem email już istnieje'
      });
    }

    // Walidacja hasła
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Hasło musi mieć co najmniej 6 znaków'
      });
    }

    // Utwórz nowego użytkownika
    const user = new User({
      name: name.trim(),
      surname: surname.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      phone: phone || null
    });

    await user.save();

    // Wygeneruj token
    const token = user.generateAuthToken();

    res.status(201).json({
      success: true,
      message: 'Użytkownik został pomyślnie zarejestrowany',
      data: {
        user: {
          id: user._id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          phone: user.phone,
          profilePicture: user.profilePicture,
          role: user.role,
          fullName: user.fullName
        },
        token
      }
    });

  } catch (error) {
    console.error('Błąd rejestracji:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: errors.join(', ')
      });
    }
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Użytkownik z tym adresem email już istnieje'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas rejestracji'
    });
  }
});

// Logowanie użytkownika
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email i hasło są wymagane'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Nieprawidłowy email lub hasło'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Konto użytkownika jest nieaktywne'
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Nieprawidłowy email lub hasło'
      });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = user.generateAuthToken();

    res.json({
      success: true,
      message: 'Logowanie pomyślne',
      data: {
        user: {
          id: user._id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          phone: user.phone,
          profilePicture: user.profilePicture,
          role: user.role,
          fullName: user.fullName,
          lastLogin: user.lastLogin
        },
        token
      }
    });

  } catch (error) {
    console.error('Błąd logowania:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas logowania'
    });
  }
});

// Pobierz dane aktualnego użytkownika
router.get('/me', auth, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: {
          id: req.user._id,
          name: req.user.name,
          surname: req.user.surname,
          email: req.user.email,
          phone: req.user.phone,
          profilePicture: req.user.profilePicture,
          role: req.user.role,
          fullName: req.user.fullName,
          lastLogin: req.user.lastLogin,
          createdAt: req.user.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Błąd pobierania danych użytkownika:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas pobierania danych użytkownika'
    });
  }
});

// Aktualizacja profilu użytkownika
router.put('/profile', auth, upload.single('profilePicture'), async (req, res) => {
  try {
    const { name, surname, phone } = req.body;
    const updateData = {};

    if (name) updateData.name = name.trim();
    if (surname) updateData.surname = surname.trim();
    if (phone) updateData.phone = phone.trim();

    // Obsługa zdjęcia profilowego
    if (req.file) {
      // Jeśli użytkownik ma już zdjęcie profilowe, usuń stare
      if (req.user.profilePicture) {
        const oldImagePath = path.join(__dirname, '..', req.user.profilePicture);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      
      updateData.profilePicture = `uploads/${req.file.filename}`;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profil został zaktualizowany',
      data: {
        user: {
          id: user._id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          phone: user.phone,
          profilePicture: user.profilePicture,
          role: user.role,
          fullName: user.fullName
        }
      }
    });

  } catch (error) {
    console.error('Błąd aktualizacji profilu:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: errors.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas aktualizacji profilu'
    });
  }
});

// Usunięcie zdjęcia profilowego
router.delete('/profile/picture', auth, async (req, res) => {
  try {
    if (!req.user.profilePicture) {
      return res.status(400).json({
        success: false,
        error: 'Użytkownik nie ma zdjęcia profilowego'
      });
    }

    // Usuń plik z serwera
    const imagePath = path.join(__dirname, '..', req.user.profilePicture);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    // Zaktualizuj użytkownika
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profilePicture: null },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Zdjęcie profilowe zostało usunięte',
      data: {
        user: {
          id: user._id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          phone: user.phone,
          profilePicture: user.profilePicture,
          role: user.role,
          fullName: user.fullName
        }
      }
    });

  } catch (error) {
    console.error('Błąd usuwania zdjęcia profilowego:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas usuwania zdjęcia profilowego'
    });
  }
});

// Wylogowanie
router.post('/logout', auth, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Wylogowano pomyślnie'
    });
  } catch (error) {
    console.error('Błąd wylogowania:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas wylogowania'
    });
  }
});

router.post('/reset-password-request', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email jest wymagany'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      // Dla bezpieczeństwa nie zdradzaj czy email istnieje
      return res.json({
        success: true,
        message: 'Jeśli email istnieje w systemie, wysłaliśmy link resetujący'
      });
    }

    // TODO: Wygeneruj token resetujący i wyślij email
    // Na razie zwracamy sukces dla symulacji
    res.json({
      success: true,
      message: 'Jeśli email istnieje w systemie, wysłaliśmy link resetujący'
    });

  } catch (error) {
    console.error('Błąd resetowania hasła:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas resetowania hasła'
    });
  }
});

// Zmiana hasła
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Obecne hasło i nowe hasło są wymagane'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Nowe hasło musi mieć co najmniej 6 znaków'
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Obecne hasło jest nieprawidłowe'
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Hasło zostało pomyślnie zmienione'
    });

  } catch (error) {
    console.error('Błąd zmiany hasła:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd serwera podczas zmiany hasła'
    });
  }
});

module.exports = router;