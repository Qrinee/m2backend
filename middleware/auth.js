const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Pobierz token z cookies
    const token = req.cookies.token;
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Brak tokena autoryzacyjnego' 
      });
    }

    // Zweryfikuj token
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'tajny_klucz_do_zmiany_w_produkcji'
    );
    
    // Znajdź użytkownika
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token nieprawidłowy - użytkownik nie istnieje' 
      });
    }

    // Sprawdź czy konto jest aktywne
    if (!user.isActive) {
      return res.status(401).json({ 
        success: false, 
        error: 'Konto użytkownika jest nieaktywne' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Błąd autoryzacji:', error);
    
    // Jeśli token wygasł, wyczyść cookie
    if (error.name === 'TokenExpiredError') {
      res.clearCookie('token');
    }
    
    res.status(401).json({ 
      success: false, 
      error: 'Token nieprawidłowy' 
    });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    
    if (token) {
      const decoded = jwt.verify(
        token, 
        process.env.JWT_SECRET || 'tajny_klucz_do_zmiany_w_produkcji'
      );
      
      const user = await User.findById(decoded.userId);
      if (user && user.isActive) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // W przypadku błędu tokena, po prostu kontynuuj bez użytkownika
    next();
  }
};

const adminAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          error: 'Brak uprawnień administratora' 
        });
      }
      next();
    });
  } catch (error) {
    res.status(401).json({ 
      success: false, 
      error: 'Błąd autoryzacji administratora' 
    });
  }
};

module.exports = { auth, optionalAuth, adminAuth };