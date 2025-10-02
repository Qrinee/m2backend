const nodemailer = require('nodemailer');

// Konfiguracja transportera
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true dla 465, false dla innych portów
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// Szablon maila do admina
const createAdminEmailTemplate = (formData) => {
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
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📧 Nowe zapytanie kredytowe</h1>
    </div>
    <div class="content">
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
        <span class="value">${formData.phone}</span>
      </div>
      <div class="field">
        <span class="label">Cena nieruchomości:</span>
        <span class="value">${formData.propertyPrice} PLN</span>
      </div>
      <div class="field">
        <span class="label">Wkład własny:</span>
        <span class="value">${formData.ownContribution} PLN</span>
      </div>
      <div class="field">
        <span class="label">Okres spłaty:</span>
        <span class="value">${formData.loanTerm} miesięcy</span>
      </div>
      <div class="field">
        <span class="label">Rata miesięczna:</span>
        <span class="value">${formData.monthlyPayment} PLN</span>
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

// Szablon maila do użytkownika
const createUserEmailTemplate = (formData) => {
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
    .label { font-weight: bold; color: #2c3e50; }
    .value { color: #34495e; }
    .footer { margin-top: 20px; padding: 20px; background: #ecf0f1; text-align: center; font-size: 12px; color: #7f8c8d; }
    .thank-you { text-align: center; margin: 20px 0; font-size: 18px; color: #27ae60; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏠 Dziękujemy za zapytanie kredytowe</h1>
    </div>
    <div class="content">
      <div class="thank-you">
        <strong>Dziękujemy ${formData.name} za złożenie zapytania kredytowego!</strong>
      </div>
      <p>Otrzymaliśmy Twoje zgłoszenie i skontaktujemy się z Tobą w ciągu 24 godzin.</p>
      
      <h3>Podsumowanie Twojego zapytania:</h3>
      <div class="field">
        <span class="label">Cena nieruchomości:</span>
        <span class="value">${formData.propertyPrice} PLN</span>
      </div>
      <div class="field">
        <span class="label">Wkład własny:</span>
        <span class="value">${formData.ownContribution} PLN</span>
      </div>
      <div class="field">
        <span class="label">Okres spłaty:</span>
        <span class="value">${formData.loanTerm} miesięcy</span>
      </div>
      <div class="field">
        <span class="label">Przewidywana rata:</span>
        <span class="value">${formData.monthlyPayment} PLN</span>
      </div>
      
      <p style="margin-top: 20px;">
        <strong>Dane kontaktowe:</strong><br>
        Email: ${process.env.ADMIN_EMAIL}<br>
        Telefon: +48 123 456 789
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

// Funkcja wysyłająca maila
const sendEmail = async (to, subject, html) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"System Nieruchomości" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email wysłany pomyślnie:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Błąd podczas wysyłania emaila:', error);
    return { success: false, error: error.message };
  }
};

// Główna funkcja do wysyłania maili kredytowych
const sendLoanInquiryEmails = async (formData) => {
  try {
    // Walidacja danych
    if (!formData.name || !formData.email || !formData.propertyPrice) {
      throw new Error('Brak wymaganych pól: name, email, propertyPrice');
    }

    const results = [];

    // 1. Wyślij maila do admina
    const adminSubject = `📋 Nowe zapytanie kredytowe - ${formData.name}`;
    const adminHtml = createAdminEmailTemplate(formData);
    const adminResult = await sendEmail(process.env.ADMIN_EMAIL, adminSubject, adminHtml);
    results.push({ to: 'admin', ...adminResult });

    // 2. Wyślij maila potwierdzającego do użytkownika
    const userSubject = '🏠 Dziękujemy za zapytanie kredytowe';
    const userHtml = createUserEmailTemplate(formData);
    const userResult = await sendEmail(formData.email, userSubject, userHtml);
    results.push({ to: 'user', ...userResult });

    return {
      success: results.every(result => result.success),
      results: results
    };

  } catch (error) {
    console.error('Błąd w sendLoanInquiryEmails:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendLoanInquiryEmails,
  sendEmail
};