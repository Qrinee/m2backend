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
  
  // Typ formularza - ZAKTUALIZOWANE enum
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

  // NOWE: Dane dla ogólnych zapytań kontaktowych
  contactInquiry: {
    message: String,
    gdprAccepted: {
      type: Boolean,
      default: false
    }
  },

  // NOWE: Dane dla zgłoszeń nieruchomości
  propertySubmission: {
    message: String,
    propertyDetails: String
  },

  // NOWE: Dane dla zapytań partnerskich
  partnerInquiry: {
    companyName: String,
    message: String,
    cooperationType: String
  },

  // NOWE: Dane dla aplikacji rekrutacyjnych
  employeeInquiry: {
    position: String,
    message: String,
    cvFile: String, // Ścieżka do załączonego pliku CV
    experience: String
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
    enum: ['new', 'contacted', 'replied', 'closed', 'archived'],
    default: 'new'
  },

  // NOWE: Priorytet zgłoszenia
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  // NOWE: Źródło formularza
  source: {
    type: String,
    default: 'website'
  },

  // NOWE: Tagi dla lepszej organizacji
  tags: [{
    type: String,
    trim: true
  }],
  
  // Notatki wewnętrzne
  internalNotes: {
    type: String,
    default: ''
  },

  // NOWE: Data ostatniej aktualizacji statusu
  lastStatusUpdate: {
    type: Date,
    default: Date.now
  },

  // NOWE: Przypisany agent/opiekun
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }

}, {
  timestamps: true
});

// Indeksy dla lepszej wydajności - ZAKTUALIZOWANE
formSubmissionSchema.index({ email: 1, createdAt: -1 });
formSubmissionSchema.index({ formType: 1, status: 1 });
formSubmissionSchema.index({ createdAt: -1 });
formSubmissionSchema.index({ status: 1, priority: -1 }); // NOWY
formSubmissionSchema.index({ assignedTo: 1, status: 1 }); // NOWY
formSubmissionSchema.index({ tags: 1 }); // NOWY

// Metoda statyczna do pobierania formularzy z paginacją - ZAKTUALIZOWANA
formSubmissionSchema.statics.getPaginated = async function(query = {}, page = 1, limit = 10, sort = { createdAt: -1 }) {
  const skip = (page - 1) * limit;
  
  const [submissions, total] = await Promise.all([
    this.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('propertyInquiry.propertyId', 'nazwa cena lokalizacja')
      .populate('assignedTo', 'name email'),
    this.countDocuments(query)
  ]);
  
  return {
    submissions,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    totalSubmissions: total
  };
};

// NOWA: Metoda do pobierania statystyk
formSubmissionSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$formType',
        count: { $sum: 1 },
        new: {
          $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] }
        },
        contacted: {
          $sum: { $cond: [{ $eq: ['$status', 'contacted'] }, 1, 0] }
        }
      }
    }
  ]);
  
  return stats;
};

// NOWA: Metoda do wyszukiwania formularzy
formSubmissionSchema.statics.searchSubmissions = async function(searchTerm, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  
  const query = {
    $or: [
      { name: { $regex: searchTerm, $options: 'i' } },
      { email: { $regex: searchTerm, $options: 'i' } },
      { phone: { $regex: searchTerm, $options: 'i' } },
      { 'propertyInquiry.message': { $regex: searchTerm, $options: 'i' } },
      { 'contactInquiry.message': { $regex: searchTerm, $options: 'i' } },
      { 'partnerInquiry.message': { $regex: searchTerm, $options: 'i' } },
      { 'employeeInquiry.message': { $regex: searchTerm, $options: 'i' } }
    ]
  };
  
  return this.getPaginated(query, page, limit);
};

// Metoda do oznaczania jako skontaktowany - ZAKTUALIZOWANA
formSubmissionSchema.methods.markAsContacted = function(notes = '', assignedTo = null) {
  this.status = 'contacted';
  this.lastStatusUpdate = new Date();
  
  if (notes) {
    this.internalNotes += `\n${new Date().toISOString()}: ${notes}`;
  }
  
  if (assignedTo) {
    this.assignedTo = assignedTo;
  }
  
  return this.save();
};

// NOWA: Metoda do zmiany priorytetu
formSubmissionSchema.methods.setPriority = function(priority, notes = '') {
  this.priority = priority;
  
  if (notes) {
    this.internalNotes += `\n${new Date().toISOString()}: Zmiana priorytetu na ${priority}. ${notes}`;
  }
  
  return this.save();
};

// NOWA: Metoda do dodawania tagów
formSubmissionSchema.methods.addTags = function(tags) {
  if (Array.isArray(tags)) {
    tags.forEach(tag => {
      if (!this.tags.includes(tag)) {
        this.tags.push(tag);
      }
    });
  } else if (!this.tags.includes(tags)) {
    this.tags.push(tags);
  }
  
  return this.save();
};

// NOWA: Metoda do przypisywania agenta
formSubmissionSchema.methods.assignTo = function(userId, notes = '') {
  this.assignedTo = userId;
  
  if (notes) {
    this.internalNotes += `\n${new Date().toISOString()}: Przypisano do agenta. ${notes}`;
  }
  
  return this.save();
};

// NOWA: Wirtualne pole dla wieku zgłoszenia (w dniach)
formSubmissionSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  const diffTime = Math.abs(now - created);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Upewnij się, że wirtualne pola są uwzględniane w JSON
formSubmissionSchema.set('toJSON', { virtuals: true });
formSubmissionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('FormSubmission', formSubmissionSchema);