const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// Rejestracja użytkownika
router.post('/register', async (req, res) => {
  try {
    const { name, surname, email, password, phone } = req.body;

    // Walidacja wymaganych pól
    if (!name || !surname || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Wszystkie pola są wymagane'
      });
    }

    // Sprawdź czy użytkownik już istnieje
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Użytkownik z tym adresem email już istnieje'
      });
    }

    // Utwórz nowego użytkownika
    const user = new User({
      name,
      surname,
      email,
      password,
      phone: phone || null
    });

    await user.save();

    // Generuj token JWT
    const token = user.generateAuthToken();

    // Ustaw token jako HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 dni
    });

    res.status(201).json({
      success: true,
      message: 'Rejestracja zakończona pomyślnie',
      data: {
        user: {
          id: user._id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          phone: user.phone,
          role: user.role,
          profilePicture: user.profilePicture
        }
      }
    });

  } catch (error) {
    console.error('Błąd rejestracji:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Logowanie użytkownika
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Walidacja
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email i hasło są wymagane'
      });
    }

    // Znajdź użytkownika i włącz pole password
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Nieprawidłowy email lub hasło'
      });
    }

    // Sprawdź czy konto jest aktywne
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Konto zostało dezaktywowane'
      });
    }

    // Sprawdź hasło
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Nieprawidłowy email lub hasło'
      });
    }

    // Aktualizuj ostatnie logowanie
    user.lastLogin = new Date();
    await user.save();

    // Generuj token JWT
    const token = user.generateAuthToken();

    // Ustaw token jako HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 dni
    });

    res.json({
      success: true,
      message: 'Logowanie zakończone pomyślnie',
      data: {
        user: {
          id: user._id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          phone: user.phone,
          role: user.role,
          profilePicture: user.profilePicture,
          lastLogin: user.lastLogin
        }
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

// Wylogowanie użytkownika
router.post('/logout', (req, res) => {
  try {
    // Wyczyść cookie z tokenem
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.json({
      success: true,
      message: 'Wylogowano pomyślnie'
    });

  } catch (error) {
    console.error('Błąd wylogowania:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd podczas wylogowania'
    });
  }
});

// Pobierz aktualnego użytkownika
router.get('/me', auth, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.user
      }
    });
  } catch (error) {
    console.error('Błąd pobierania danych użytkownika:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd pobierania danych użytkownika'
    });
  }
});

// Resetowanie hasła - żądanie
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email jest wymagany'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Dla bezpieczeństwa nie ujawniamy czy email istnieje
      return res.json({
        success: true,
        message: 'Jeśli email istnieje w systemie, wysłaliśmy instrukcje resetowania hasła'
      });
    }

    // TODO: Zaimplementuj wysyłkę emaila z tokenem resetowania
    // Na razie zwracamy sukces dla UX
    res.json({
      success: true,
      message: 'Jeśli email istnieje w systemie, wysłaliśmy instrukcje resetowania hasła'
    });

  } catch (error) {
    console.error('Błąd resetowania hasła:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd podczas przetwarzania żądania resetowania hasła'
    });
  }
});

// Aktualizacja profilu użytkownika
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, surname, phone, profilePicture } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        name,
        surname,
        phone,
        profilePicture,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profil zaktualizowany pomyślnie',
      data: {
        user: updatedUser
      }
    });

  } catch (error) {
    console.error('Błąd aktualizacji profilu:', error);
    res.status(400).json({
      success: false,
      error: error.message
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
        error: 'Obecne i nowe hasło są wymagane'
      });
    }

    // Pobierz użytkownika z hasłem
    const user = await User.findById(req.user._id).select('+password');
    
    // Sprawdź obecne hasło
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Obecne hasło jest nieprawidłowe'
      });
    }

    // Zmień hasło
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Hasło zostało zmienione pomyślnie'
    });

  } catch (error) {
    console.error('Błąd zmiany hasła:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;