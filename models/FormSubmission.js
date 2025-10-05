const mongoose = require('mongoose');

const formSubmissionSchema = new mongoose.Schema({
  // Podstawowe dane kontaktowe
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  
  // Typ formularza
  formType: {
    type: String,
    required: true,
    enum: ['property_inquiry', 'loan_inquiry'],
    default: 'property_inquiry'
  },
  
  // Dane specyficzne dla zapytań o nieruchomości
  propertyInquiry: {
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property'
    },
    propertyName: String,
    propertyPrice: String,
    propertyLocation: String,
    message: String
  },
  
  // Dane specyficzne dla zapytań kredytowych
  loanInquiry: {
    propertyPrice: String,
    ownContribution: String,
    loanTerm: String,
    monthlyPayment: String,
    interestRate: String
  },
  
  // Informacje techniczne
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  
  // Status przetworzenia
  status: {
    type: String,
    enum: ['new', 'contacted', 'replied', 'closed'],
    default: 'new'
  },
  
  // Notatki wewnętrzne
  internalNotes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Indeksy dla lepszej wydajności
formSubmissionSchema.index({ email: 1, createdAt: -1 });
formSubmissionSchema.index({ formType: 1, status: 1 });
formSubmissionSchema.index({ createdAt: -1 });

// Metoda statyczna do pobierania formularzy z paginacją
formSubmissionSchema.statics.getPaginated = async function(query = {}, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  
  const [submissions, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('propertyInquiry.propertyId', 'nazwa cena lokalizacja'),
    this.countDocuments(query)
  ]);
  
  return {
    submissions,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    totalSubmissions: total
  };
};

// Metoda do oznaczania jako skontaktowany
formSubmissionSchema.methods.markAsContacted = function(notes = '') {
  this.status = 'contacted';
  if (notes) {
    this.internalNotes += `\n${new Date().toISOString()}: ${notes}`;
  }
  return this.save();
};

module.exports = mongoose.model('FormSubmission', formSubmissionSchema);