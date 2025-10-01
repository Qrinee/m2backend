const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'Brak tokena dostępu. Dostęp zabroniony.' 
      });
    }

    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'tajny_klucz_do_zmiany_w_produkcji'
    );
    
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        success: false,
        error: 'Token nieprawidłowy lub użytkownik nieaktywny.' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Błąd uwierzytelniania:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        error: 'Nieprawidłowy token.' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token wygasł.' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Błąd serwera podczas uwierzytelniania.' 
    });
  }
};

// Middleware dla administratorów
const adminAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {});
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Brak uprawnień administratora.' 
      });
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { auth, adminAuth };