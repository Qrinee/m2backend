const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  path: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  isCover: { type: Boolean, default: false },
  uploadDate: { type: Date, default: Date.now }
});

const propertySchema = new mongoose.Schema({
  // 1. Tytuł ogłoszenia
  tytul: { type: String, required: true },
  
  // 2. Cena nieruchomości
  cena: { 
    calkowita: { type: Number, required: true },
    zaM2: { type: Number },
    waluta: { type: String, default: 'PLN' }
  },
  
  // 3. Rodzaj oferty
  rodzajOferty: {
    typ: { type: String, enum: ['sprzedaz', 'wynajem'], required: true },
    rynek: { type: String, enum: ['pierwotny', 'wtorny'], required: true }
  },
  
  // 4. Typ nieruchomości / kategoria
  typNieruchomosci: { 
    type: String, 
    enum: ['mieszkanie', 'dom', 'lokal_uzytkowy', 'dzialka', 'hala_magazyn', 'biuro', 'komercyjne', 'inne'],
    required: true 
  },
  
  // 5. Lokalizacja
  lokalizacja: {
    wojewodztwo: { type: String, required: true },
    powiat: { type: String },
    gmina: { type: String },
    miasto: { type: String, required: true },
    dzielnica: { type: String },
    ulica: { type: String },
    kodPocztowy: { type: String },
    lat: { type: Number },
    lon: { type: Number }
  },
  
  // 6. Powierzchnie / metry
  powierzchnia: {
    calkowita: { type: Number, required: true },
    uzytkowa: { type: Number },
    dodatkowe: {
      balkon: { type: Number },
      taras: { type: Number },
      piwnica: { type: Number },
      komorka: { type: Number },
      ogrod: { type: Number },
      garaz: { type: Number }
    }
  },
  
  // 7. Liczba pokoi / pomieszczeń
  pomieszczenia: {
    pokoje: { type: Number, required: true },
    lazienki: { type: Number, required: true },
    kuchnia: { type: String, enum: ['osobna', 'otwarta', 'brak'] },
    garderoby: { type: Number },
    gabinety: { type: Number }
  },
  
  // 8. Piętro i liczba pięter
  pietro: {
    pietroNieruchomosci: { type: Number },
    liczbaPieter: { type: Number },
    winda: { type: Boolean, default: false }
  },
  
  // 9. Rok budowy / stan budynku
  budynek: {
    rokBudowy: { type: Number },
    stanTechniczny: { type: String, enum: ['do_remontu', 'stan_developer', 'bardzo_dobry', 'dobry', 'do_odswiezenia'] },
    remonty: [{
      rok: { type: Number },
      opis: { type: String }
    }],
    material: { type: String },
    stanWykonczenia: { type: String }
  },
  
  // 10. Media / instalacje
  media: {
    ogrzewanie: { type: String },
    cieplaWoda: { type: String },
    kanalizacja: { type: Boolean, default: false },
    prad: { type: Boolean, default: false },
    gaz: { type: Boolean, default: false },
    klimatyzacja: { type: Boolean, default: false },
    wentylacja: { type: String },
    alarm: { type: Boolean, default: false },
    domofon: { type: Boolean, default: false },
    internet: { type: Boolean, default: false }
  },
  
  // 11. Wyposażenie / udogodnienia
  wyposazenie: {
    meble: { type: Boolean, default: false },
    agd: [{ type: String }], // lodówka, pralka, etc.
    okna: { type: String },
    podlogi: { type: String },
    rolety: { type: Boolean, default: false },
    systemAlarmowy: { type: Boolean, default: false },
    monitoring: { type: Boolean, default: false }
  },
  
  // 12. Dodatkowe udogodnienia
  udogodnienia: {
    balkon: { type: Boolean, default: false },
    taras: { type: Boolean, default: false },
    ogrod: { type: Boolean, default: false },
    garaz: { type: Boolean, default: false },
    parking: { type: Boolean, default: false },
    piwnica: { type: Boolean, default: false },
    komorka: { type: Boolean, default: false },
    basen: { type: Boolean, default: false },
    silownia: { type: Boolean, default: false },
    monitoringOsiedla: { type: Boolean, default: false },
    ochrona: { type: Boolean, default: false }
  },
  
  // 13. Opis tekstowy
  opis: { type: String, required: true },
  dodatkoweInformacje: { type: String }, // otoczenie, komunikacja, szkoły, sklepy
  warunki: { type: String }, // warunki sprzedaży/wynajmu
  
  // 14. Multimedia
  multimedia: {
    zdjecia: [fileSchema],
    film: { type: String }, // URL do filmu
    wirtualnySpacer: { type: String }, // URL do spaceru 360°
    rzuty: { type: String } // URL do planów
  },
  
  // 15. Informacje prawne
  informacjePrawne: {
    formaWlasnosci: { 
      type: String, 
      enum: ['wlasnosc', 'spoldzielcze_wlasnosciowe', 'uzytkowanie_wieczyste', 'inne'] 
    },
    obciazenia: { type: String },
    hipoteka: { type: Boolean, default: false },
    charakterystykaEnergetyczna: {
      klasa: { type: String },
      wskaznik: { type: String }
    },
    pozwolenieNaBudowe: { type: Boolean },
    ksiegWieczysty: { type: String }
  },
  
  // 16. Dane kontaktowe
  kontakt: {
    imie: { type: String, required: true },
    nazwisko: { type: String, required: true },
    telefon: { type: String, required: true },
    email: { type: String, required: true },
    biuroNieruchomosci: { type: String },
    pozycja: { type: String }
  },
  
  // 17. Promocje/wyróżnienia
  promocje: {
    wyróżnione: { type: Boolean, default: false },
    topOgloszenie: { type: Boolean, default: false },
    podbicia: { type: Number, default: 0 },
    pakietReklamowy: { type: String, enum: ['standard', 'premium', 'vip', 'brak'], default: 'brak' }
  },
  
  // 18. Daty i statusy
  daty: {
    dataPublikacji: { type: Date, default: Date.now },
    dataWaznosci: { type: Date, required: true },
    dataAktualizacji: { type: Date, default: Date.now },
    mozliwoscPrzedluzenia: { type: Boolean, default: true }
  },
  
  // Przypisanie do użytkownika
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Status ogłoszenia
  status: { 
    type: String, 
    enum: ['aktywne', 'nieaktywne', 'weryfikacja', 'zarchiwizowane', 'sprzedane', 'wynajete'], 
    default: 'weryfikacja' 
  },
  
  // Metadane
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Middleware do automatycznego obliczania ceny za m²
propertySchema.pre('save', function(next) {
  // Oblicz cenę za m² jeśli mamy cenę całkowitą i powierzchnię
  if (this.cena && this.cena.calkowita && this.powierzchnia && this.powierzchnia.calkowita) {
    this.cena.zaM2 = this.cena.calkowita / this.powierzchnia.calkowita;
  }
  
  this.updatedAt = Date.now();
  next();
});

// Indeksy dla lepszej wydajności
propertySchema.index({ user: 1, createdAt: -1 });
propertySchema.index({ status: 1 });
propertySchema.index({ 'cena.calkowita': 1 });
propertySchema.index({ 'lokalizacja.wojewodztwo': 1 });
propertySchema.index({ 'lokalizacja.miasto': 1 });
propertySchema.index({ 'rodzajOferty.typ': 1 });
propertySchema.index({ 'daty.dataWaznosci': 1 });
propertySchema.index({ 'promocje.wyróżnione': 1 });
propertySchema.index({ 'promocje.topOgloszenie': 1 });

module.exports = mongoose.model('Property', propertySchema);