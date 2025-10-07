const express = require('express');
const router = express.Router();
const { sendLoanInquiryEmails } = require('../utils/emailSender');
const FormSubmission = require('../models/FormSubmission');

// Funkcja pomocnicza do pobierania adresu IP
const getClientIp = (req) => {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         'unknown';
};


// POST - Wysyłanie zapytania kredytowego
router.post('/loan-inquiry', async (req, res) => {
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

// GET - Pobieranie formularzy (dla panelu admina)
router.get('/submissions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const formType = req.query.type; // property_inquiry lub loan_inquiry
    const status = req.query.status;

    const query = {};
    if (formType) query.formType = formType;
    if (status) query.status = status;

    const result = await FormSubmission.getPaginated(query, page, limit);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET - Pobieranie pojedynczego formularza
router.get('/submissions/:id', async (req, res) => {
  try {
    const submission = await FormSubmission.findById(req.params.id)
      .populate('propertyInquiry.propertyId');

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
router.put('/submissions/:id', async (req, res) => {
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

// GET - Testowy endpoint do sprawdzenia konfiguracji email
router.get('/test-email', async (req, res) => {
  try {
    const testData = {
      name: 'Jan Kowalski',
      email: process.env.ADMIN_EMAIL,
      phone: '+48 123 456 789',
      propertyPrice: '450000 PLN',
      ownContribution: '90000 PLN',
      loanTerm: '360 mies.',
      monthlyPayment: '1850 PLN'
    };

    const result = await sendLoanInquiryEmails(testData);

    res.json({
      success: result.success,
      message: 'Testowy email został wysłany',
      results: result.results
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE - Usuwanie formularza
router.delete('/submissions/:id', async (req, res) => {
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
      propertyInquiry: {
        message: message ? message.trim() : 'Brak wiadomości'
      },
      ipAddress: getClientIp(req),
      userAgent: req.get('User-Agent')
    });

    await formSubmission.save();

    // Tutaj możesz dodać wysyłanie emaila powiadomienia
    // await sendPropertySubmissionNotification({ name, email, phone, message });

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

module.exports = router;