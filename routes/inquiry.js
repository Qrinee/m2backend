const express = require('express');
const router = express.Router();
const multer = require('multer');
const { sendLoanInquiryEmails, sendEmail } = require('../utils/emailSender');
const FormSubmission = require('../models/FormSubmission');
const Property = require('../models/Property');
const { adminAuth } = require('../middleware/auth');

// Konfiguracja multer dla plików CV
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/cv/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'cv-' + uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' ||
        file.mimetype === 'application/msword' ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Nieprawidłowy format pliku. Akceptowane formaty: PDF, DOC, DOCX.'), false);
    }
  }
});

// Funkcja pomocnicza do pobierania adresu IP
const getClientIp = (req) => {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         'unknown';
};

// Funkcja pomocnicza do formatowania waluty
function formatCurrency(amount) {
  if (!amount) return '0 PLN';
  
  const number = typeof amount === 'string' 
    ? parseFloat(amount.replace(/[^\d.,]/g, '').replace(',', '.')) 
    : Number(amount);
  
  if (isNaN(number)) return '0 PLN';
  
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN'
  }).format(number);
}

// Szablon emaila dla formularza kontaktowego
const createContactEmailTemplate = (formData) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
    .content { background: #f9f9f9; padding: 20px; }
    .field { margin-bottom: 15px; }
    .footer { margin-top: 20px; padding: 20px; background: #ecf0f1; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Nowa wiadomość kontaktowa</h1>
    </div>
    <div class="content">
      <div class="field"><strong>Imię i nazwisko:</strong> ${formData.name}</div>
      <div class="field"><strong>Email:</strong> ${formData.email}</div>
      <div class="field"><strong>Telefon:</strong> ${formData.phone || 'Nie podano'}</div>
      <div class="field"><strong>Wiadomość:</strong> ${formData.message}</div>
      <div class="field"><strong>Data:</strong> ${new Date().toLocaleString('pl-PL')}</div>
    </div>
    <div class="footer">
      <p>Wiadomość z formularza kontaktowego</p>
    </div>
  </div>
</body>
</html>`;
};

// Szablon emaila dla zgłoszenia nieruchomości
const createPropertySubmissionTemplate = (formData) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #8e44ad; color: white; padding: 20px; text-align: center; }
    .content { background: #f9f9f9; padding: 20px; }
    .field { margin-bottom: 15px; }
    .footer { margin-top: 20px; padding: 20px; background: #ecf0f1; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Nowe zgłoszenie nieruchomości</h1>
    </div>
    <div class="content">
      <div class="field"><strong>Imię i nazwisko:</strong> ${formData.name}</div>
      <div class="field"><strong>Email:</strong> ${formData.email}</div>
      <div class="field"><strong>Telefon:</strong> ${formData.phone || 'Nie podano'}</div>
      <div class="field"><strong>Wiadomość:</strong> ${formData.message || 'Brak wiadomości'}</div>
      <div class="field"><strong>Data:</strong> ${new Date().toLocaleString('pl-PL')}</div>
    </div>
    <div class="footer">
      <p>Wiadomość z formularza zgłoszenia nieruchomości</p>
    </div>
  </div>
</body>
</html>`;
};

// Szablon emaila dla formularza partnerskiego
const createPartnerEmailTemplate = (formData) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #27ae60; color: white; padding: 20px; text-align: center; }
    .content { background: #f9f9f9; padding: 20px; }
    .field { margin-bottom: 15px; }
    .footer { margin-top: 20px; padding: 20px; background: #ecf0f1; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Nowa propozycja współpracy partnerskiej</h1>
    </div>
    <div class="content">
      <div class="field"><strong>Nazwa:</strong> ${formData.name}</div>
      <div class="field"><strong>Email:</strong> ${formData.email}</div>
      <div class="field"><strong>Telefon:</strong> ${formData.phone || 'Nie podano'}</div>
      <div class="field"><strong>Wiadomość:</strong> ${formData.message}</div>
      <div class="field"><strong>Data:</strong> ${new Date().toLocaleString('pl-PL')}</div>
    </div>
    <div class="footer">
      <p>Wiadomość z formularza partnerskiego</p>
    </div>
  </div>
</body>
</html>`;
};

// Szablon emaila dla formularza rekrutacyjnego
const createEmployeeEmailTemplate = (formData) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #e67e22; color: white; padding: 20px; text-align: center; }
    .content { background: #f9f9f9; padding: 20px; }
    .field { margin-bottom: 15px; }
    .footer { margin-top: 20px; padding: 20px; background: #ecf0f1; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Nowa aplikacja rekrutacyjna</h1>
    </div>
    <div class="content">
      <div class="field"><strong>Imię i nazwisko:</strong> ${formData.name}</div>
      <div class="field"><strong>Email:</strong> ${formData.email}</div>
      <div class="field"><strong>Telefon:</strong> ${formData.phone || 'Nie podano'}</div>
      <div class="field"><strong>Wiadomość:</strong> ${formData.message}</div>
      <div class="field"><strong>Załączone CV:</strong> ${formData.cvFile ? 'Tak' : 'Nie'}</div>
      <div class="field"><strong>Data:</strong> ${new Date().toLocaleString('pl-PL')}</div>
    </div>
    <div class="footer">
      <p>Wiadomość z formularza rekrutacyjnego</p>
    </div>
  </div>
</body>
</html>`;
};

// POST - Ogólny formularz kontaktowy
router.post('/contact', async (req, res) => {
  try {
    const { name, email, phone, message, gdpr } = req.body;

    // Walidacja wymaganych pól
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: 'Wymagane pola: name, email, message'
      });
    }

    // Walidacja GDPR
    if (!gdpr) {
      return res.status(400).json({
        success: false,
        error: 'Wymagana zgoda GDPR'
      });
    }

    // Walidacja emaila
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Nieprawidłowy format emaila'
      });
    }

    // Zapisz formularz w bazie danych
    const formSubmission = new FormSubmission({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : null,
      formType: 'contact_inquiry',
      contactInquiry: {
        message: message.trim(),
        gdprAccepted: gdpr
      },
      ipAddress: getClientIp(req),
      userAgent: req.get('User-Agent')
    });

    await formSubmission.save();

    // Wyślij email
    await sendEmail(
      process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL,
      'Nowa wiadomość kontaktowa',
      createContactEmailTemplate({ name, email, phone, message, gdpr })
    );

    res.status(200).json({
      success: true,
      message: 'Wiadomość została wysłana pomyślnie',
      data: {
        name: formSubmission.name,
        email: formSubmission.email,
        timestamp: new Date().toISOString(),
        submissionId: formSubmission._id
      }
    });

  } catch (error) {
    console.error('Błąd endpointu /contact:', error);
    res.status(500).json({
      success: false,
      error: 'Wewnętrzny błąd serwera',
      details: error.message
    });
  }
});

// POST - Zgłoszenie nieruchomości do sprzedaży
router.post('/property-submission', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    // Walidacja wymaganych pól
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Wymagane pola: name, email'
      });
    }

    // Walidacja emaila
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Nieprawidłowy format emaila'
      });
    }

    // Zapisz formularz w bazie danych
    const formSubmission = new FormSubmission({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : null,
      formType: 'property_submission',
      propertySubmission: {
        message: message ? message.trim() : 'Brak wiadomości'
      },
      ipAddress: getClientIp(req),
      userAgent: req.get('User-Agent')
    });

    await formSubmission.save();

    // Wyślij email
    await sendEmail(
      process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL,
      'Nowe zgłoszenie nieruchomości do sprzedaży',
      createPropertySubmissionTemplate({ name, email, phone, message })
    );

    res.status(200).json({
      success: true,
      message: 'Zgłoszenie nieruchomości zostało wysłane pomyślnie',
      data: {
        name: formSubmission.name,
        email: formSubmission.email,
        timestamp: new Date().toISOString(),
        submissionId: formSubmission._id
      }
    });

  } catch (error) {
    console.error('Błąd endpointu /property-submission:', error);
    res.status(500).json({
      success: false,
      error: 'Wewnętrzny błąd serwera',
      details: error.message
    });
  }
});

// POST - Formularz partnerski
router.post('/partner', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    // Walidacja
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: 'Wymagane pola: name, email, message'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Nieprawidłowy format emaila'
      });
    }

    // Zapisz w bazie
    const formSubmission = new FormSubmission({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : null,
      formType: 'partner_inquiry',
      partnerInquiry: {
        message: message.trim()
      },
      ipAddress: getClientIp(req),
      userAgent: req.get('User-Agent')
    });

    await formSubmission.save();

    // Wyślij email
    await sendEmail(
      process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL,
      'Nowa propozycja współpracy partnerskiej',
      createPartnerEmailTemplate({ name, email, phone, message })
    );

    res.json({
      success: true,
      message: 'Propozycja współpracy została wysłana',
      submissionId: formSubmission._id
    });

  } catch (error) {
    console.error('Błąd formularza partnerskiego:', error);
    res.status(500).json({
      success: false,
      error: 'Wewnętrzny błąd serwera'
    });
  }
});

// POST - Formularz rekrutacyjny (z obsługą plików)
router.post('/employee', upload.single('cv'), async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    if (!name || !email || !message || !req.file) {
      return res.status(400).json({
        success: false,
        error: 'Wymagane pola: name, email, message, CV'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Nieprawidłowy format emaila'
      });
    }

    const formSubmission = new FormSubmission({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : null,
      formType: 'employee_inquiry',
      employeeInquiry: {
        message: message.trim(),
        cvFile: req.file.filename
      },
      ipAddress: getClientIp(req),
      userAgent: req.get('User-Agent')
    });

    await formSubmission.save();

    // Wyślij email
    await sendEmail(
      process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL,
      'Nowa aplikacja rekrutacyjna',
      createEmployeeEmailTemplate({ name, email, phone, message, cvFile: req.file.filename })
    );

    res.json({
      success: true,
      message: 'Aplikacja została wysłana',
      submissionId: formSubmission._id
    });

  } catch (error) {
    console.error('Błąd formularza rekrutacyjnego:', error);
    res.status(500).json({
      success: false,
      error: 'Wewnętrzny błąd serwera'
    });
  }
});

// POST - Wysyłanie zapytania kredytowego
router.post('/loan-inquiry',  async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      propertyPrice,
      ownContribution,
      loanTerm,
      monthlyPayment,
      interestRate
    } = req.body;

    // Walidacja wymaganych pól
    if (!name || !email || !propertyPrice) {
      return res.status(400).json({
        success: false,
        error: 'Wymagane pola: name, email, propertyPrice'
      });
    }

    // Walidacja emaila
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Nieprawidłowy format emaila'
      });
    }

    // Przygotowanie danych formularza
    const formData = {
      name: name.trim(),
      email: email.trim(),
      phone: phone ? phone.trim() : 'Nie podano',
      propertyPrice: formatCurrency(propertyPrice),
      ownContribution: ownContribution ? formatCurrency(ownContribution) : 'Nie podano',
      loanTerm: loanTerm ? `${loanTerm} mies.` : 'Nie podano',
      monthlyPayment: monthlyPayment ? formatCurrency(monthlyPayment) : 'Nie podano',
      interestRate: interestRate || 'Nie podano'
    };

    // Zapisz formularz w bazie danych
    const formSubmission = new FormSubmission({
      name: formData.name,
      email: formData.email.toLowerCase(),
      phone: phone ? phone.trim() : null,
      formType: 'loan_inquiry',
      loanInquiry: {
        propertyPrice: formData.propertyPrice,
        ownContribution: formData.ownContribution,
        loanTerm: formData.loanTerm,
        monthlyPayment: formData.monthlyPayment,
        interestRate: formData.interestRate
      },
      ipAddress: getClientIp(req),
      userAgent: req.get('User-Agent')
    });

    await formSubmission.save();

    // Wysłanie maili
    const result = await sendLoanInquiryEmails(formData);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Zapytanie kredytowe zostało wysłane pomyślnie',
        data: {
          name: formData.name,
          email: formData.email,
          timestamp: new Date().toISOString(),
          submissionId: formSubmission._id
        }
      });
    } else {
      // Oznacz jako błąd w bazie
      formSubmission.status = 'closed';
      formSubmission.internalNotes = `Błąd wysyłania email: ${JSON.stringify(result.results)}`;
      await formSubmission.save();

      res.status(500).json({
        success: false,
        error: 'Błąd podczas wysyłania wiadomości email',
        details: result.results
      });
    }

  } catch (error) {
    console.error('Błąd endpointu /loan-inquiry:', error);
    res.status(500).json({
      success: false,
      error: 'Wewnętrzny błąd serwera',
      details: error.message
    });
  }
});

// GET - Pobieranie formularzy (dla panelu admina)
// GET - Pobieranie formularzy (dla panelu admina)
router.get('/submissions', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const formType = req.query.type;
    const status = req.query.status;

    const query = {};
    if (formType) query.formType = formType;
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    
    const [submissions, total] = await Promise.all([
      FormSubmission.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      FormSubmission.countDocuments(query)
    ]);

    res.json({
      success: true,
      submissions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalSubmissions: total
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// GET - Pobieranie pojedynczego formularza
router.get('/submissions/:id', adminAuth, async (req, res) => {
  try {
    const submission = await FormSubmission.findById(req.params.id);

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Formularz nie znaleziony'
      });
    }

    res.json({
      success: true,
      submission
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT - Aktualizacja statusu formularza
router.put('/submissions/:id', adminAuth, async (req, res) => {
  try {
    const { status, internalNotes } = req.body;

    const submission = await FormSubmission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Formularz nie znaleziony'
      });
    }

    if (status) submission.status = status;
    if (internalNotes) {
      submission.internalNotes += `\n${new Date().toISOString()}: ${internalNotes}`;
    }

    await submission.save();

    res.json({
      success: true,
      message: 'Formularz zaktualizowany pomyślnie',
      submission
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE - Usuwanie formularza
router.delete('/submissions/:id', adminAuth, async (req, res) => {
  try {
    const submission = await FormSubmission.findByIdAndDelete(req.params.id);
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Formularz nie znaleziony'
      });
    }

    res.json({
      success: true,
      message: 'Formularz usunięty pomyślnie'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;