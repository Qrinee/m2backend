const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Imię jest wymagane'],
    trim: true,
    maxlength: [50, 'Imię nie może przekraczać 50 znaków']
  },
  surname: {
    type: String,
    required: [true, 'Nazwisko jest wymagane'],
    trim: true,
    maxlength: [50, 'Nazwisko nie może przekraczać 50 znaków']
  },
  email: {
    type: String,
    required: [true, 'Email jest wymagany'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Podaj poprawny adres email']
  },
  password: {
    type: String,
    required: [true, 'Hasło jest wymagane'],
    minlength: [6, 'Hasło musi mieć co najmniej 6 znaków'],
    select: false
  },
  profilePicture: {
    type: String,
    default: ""
  },
  position: {
    type: String,
    default: ""
  },
  contactEmail: {
    type: String,
    default: "",
  },
  phone: {
    type: String,
    default: ""
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'agent'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  bio: {
    type: String,
    default: ""
  }
}, {
  timestamps: true
});

// Hashowanie hasła przed zapisaniem
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Metoda do porównywania haseł
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Metoda do generowania tokena JWT
userSchema.methods.generateAuthToken = function() {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { 
      userId: this._id,
      email: this.email,
      role: this.role 
    },
    process.env.JWT_SECRET || 'tajny_klucz_do_zmiany_w_produkcji',
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
};

// Wirtualne pole dla pełnego imienia i nazwiska
userSchema.virtual('fullName').get(function() {
  return `${this.name} ${this.surname}`;
});

// Wirtualne pole dla liczby nieruchomości użytkownika
userSchema.virtual('properties', {
  ref: 'Property',
  localField: '_id',
  foreignField: 'user'
});

// Metoda do zwracania danych użytkownika bez wrażliwych informacji
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  return user;
};

// Statyczna metoda do pobierania użytkownika z nieruchomościami
userSchema.statics.getUserWithProperties = function(userId) {
  return this.findById(userId)
    .populate({
      path: 'properties',
      match: { isActive: true },
      options: { sort: { createdAt: -1 } }
    });
};

module.exports = mongoose.model('User', userSchema);