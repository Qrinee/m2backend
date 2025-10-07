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
    enum: [
      'property_inquiry', 
      'loan_inquiry', 
      'contact_inquiry', 
      'property_submission', 
      'partner_inquiry', 
      'employee_inquiry'
    ],
    default: 'property_inquiry'
  },
  
  // Dane specyficzne dla różnych formularzy
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
  
  loanInquiry: {
    propertyPrice: String,
    ownContribution: String,
    loanTerm: String,
    monthlyPayment: String,
    interestRate: String
  },

  contactInquiry: {
    message: String,
    gdprAccepted: {
      type: Boolean,
      default: false
    }
  },

  propertySubmission: {
    message: String
  },

  partnerInquiry: {
    message: String
  },

  employeeInquiry: {
    message: String,
    cvFile: String
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
    enum: ['new', 'contacted', 'closed'],
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

// Podstawowe indeksy
formSubmissionSchema.index({ email: 1, createdAt: -1 });
formSubmissionSchema.index({ formType: 1, status: 1 });
formSubmissionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('FormSubmission', formSubmissionSchema);