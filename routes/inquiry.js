const { sendEmail } = require("../utils/emailSender");
const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const FormSubmission = require('../models/FormSubmission');

// Funkcja pomocnicza do pobierania adresu IP
const getClientIp = (req) => {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         'unknown';
};

// Szablon maila do właściciela
const createOwnerEmailTemplate = (formData, property) => {
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
    .label { font-weight: bold; color: #2c3e50; }
    .value { color: #34495e; }
    .footer { margin-top: 20px; padding: 20px; background: #ecf0f1; text-align: center; font-size: 12px; color: #7f8c8d; }
    .property-info { background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Nowe zapytanie o nieruchomość</h1>
    </div>
    <div class="content">
      <div class="property-info">
        <h3>Nieruchomość: ${property.nazwa}</h3>
        <p>Cena: ${property.cena}</p>
        <p>Lokalizacja: ${property.lokalizacja?.miasto || ''}, ${property.lokalizacja?.wojewodztwo || ''}</p>
      </div>
      
      <h3>Dane kontaktowe klienta:</h3>
      <div class="field">
        <span class="label">Imię i nazwisko:</span>
        <span class="value">${formData.name}</span>
      </div>
      <div class="field">
        <span class="label">Email:</span>
        <span class="value">${formData.email}</span>
      </div>
      <div class="field">
        <span class="label">Telefon:</span>
        <span class="value">${formData.phone || 'Nie podano'}</span>
      </div>
      <div class="field">
        <span class="label">Wiadomość:</span>
        <span class="value">${formData.msg || 'Brak wiadomości'}</span>
      </div>
      <div class="field">
        <span class="label">Data zgłoszenia:</span>
        <span class="value">${new Date().toLocaleString('pl-PL')}</span>
      </div>
    </div>
    <div class="footer">
      <p>Wiadomość wygenerowana automatycznie z systemu nieruchomości</p>
    </div>
  </div>
</body>
</html>
  `;
};

// Szablon maila potwierdzającego dla użytkownika
const createConfirmationEmailTemplate = (formData, property) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #27ae60; color: white; padding: 20px; text-align: center; }
    .content { background: #f9f9f9; padding: 20px; }
    .footer { margin-top: 20px; padding: 20px; background: #ecf0f1; text-align: center; font-size: 12px; color: #7f8c8d; }
    .thank-you { text-align: center; margin: 20px 0; font-size: 18px; color: #27ae60; }
    .property-info { background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Dziękujemy za zapytanie</h1>
    </div>
    <div class="content">
      <div class="thank-you">
        <strong>Dziękujemy ${formData.name} za złożenie zapytania!</strong>
      </div>
      <p>Otrzymaliśmy Twoje zgłoszenie i skontaktujemy się z Tobą w ciągu 24 godzin.</p>
      
      <div class="property-info">
        <h3>Twoje zapytanie dotyczy:</h3>
        <p><strong>${property.nazwa}</strong></p>
        <p><strong>Cena:</strong> ${property.cena}</p>
        <p><strong>Lokalizacja:</strong> ${property.lokalizacja?.miasto || ''}, ${property.lokalizacja?.wojewodztwo || ''}</p>
      </div>
      
      <h3>Podsumowanie Twojego zapytania:</h3>
      <p><strong>Email:</strong> ${formData.email}</p>
      <p><strong>Telefon:</strong> ${formData.phone || 'Nie podano'}</p>
      <p><strong>Wiadomość:</strong> ${formData.msg || 'Brak wiadomości'}</p>
      
      <p style="margin-top: 20px;">
        <strong>Dane kontaktowe biura:</strong><br>
        Email: ${process.env.CONTACT_EMAIL || 'kontakt@biuronieruchomosci.pl'}<br>
        Telefon: ${process.env.CONTACT_PHONE || '+48 123 456 789'}
      </p>
    </div>
    <div class="footer">
      <p>Wiadomość wygenerowana automatycznie. Prosimy nie odpowiadać na tego maila.</p>
    </div>
  </div>
</body>
</html>
  `;
};

// Endpoint do wysyłania zapytań
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, msg, propertyId } = req.body;

    // Walidacja danych
    if (!name || !email || !propertyId) {
      return res.status(400).json({
        success: false,
        error: 'Brak wymaganych pól: name, email, propertyId'
      });
    }

    // Znajdź nieruchomość
    const property = await Property.findById(propertyId).populate('user');
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Nie znaleziono nieruchomości'
      });
    }

    // Zapisz formularz w bazie danych
    const formSubmission = new FormSubmission({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : null,
      formType: 'property_inquiry',
      propertyInquiry: {
        propertyId: property._id,
        propertyName: property.nazwa,
        propertyPrice: property.cena,
        propertyLocation: `${property.lokalizacja?.miasto || ''}, ${property.lokalizacja?.wojewodztwo || ''}`,
        message: msg || null
      },
      ipAddress: getClientIp(req),
      userAgent: req.get('User-Agent')
    });

    await formSubmission.save();

    // Email do właściciela/agenta
    const ownerEmail = property.user?.email || process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL;
    if (ownerEmail) {
      await sendEmail(
        ownerEmail,
        `Nowe zapytanie - ${property.nazwa}`,
        createOwnerEmailTemplate(req.body, property)
      );
    }

    // Email potwierdzający do użytkownika
    await sendEmail(
      email,
      'Dziękujemy za zapytanie',
      createConfirmationEmailTemplate(req.body, property)
    );

    res.json({
      success: true,
      message: 'Wiadomość została wysłana pomyślnie',
      submissionId: formSubmission._id
    });

  } catch (error) {
    console.error('Błąd podczas wysyłania zapytania:', error);
    res.status(500).json({
      success: false,
      error: 'Wystąpił błąd podczas wysyłania wiadomości'
    });
  }
});


// POST - Ogólne zapytanie kontaktowe
router.post('/contact', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    // Walidacja wymaganych pól
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: 'Wymagane pola: name, email, message'
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
        message: message.trim()
      },
      ipAddress: getClientIp(req),
      userAgent: req.get('User-Agent')
    });

    await formSubmission.save();

    // Tutaj możesz dodać wysyłanie emaila powiadomienia
    // await sendContactNotification(formData);

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

module.exports = router;