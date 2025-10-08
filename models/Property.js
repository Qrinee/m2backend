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
  // Opis
  nazwa: { type: String, required: true },
  opis: { type: String },
  cena: { type: String },
  cenaNum: { type: Number, default: 0 }, // DODANE - dla sortowania i filtrowania
  poCenie: { type: String },
  przedCena: { type: String },
  podatek: { type: String },
  oplata: { type: String },
  kategoria: { type: String },
  wystawioneNa: { type: String },
  status: { type: String },

  // Pliki
  files: [fileSchema],

  // Lokalizacja
  lokalizacja: {
    adres: { type: String, required: true },
    wojewodztwo: { type: String },
    miasto: { type: String },
    powiat: { type: String },
    kod: { type: String },
    kraj: { type: String, default: 'Polska' },
    lat: { type: String },
    lon: { type: String },
    streetViewAngle: { type: String }
  },

  // Szczegóły
  szczegoly: {
    rozmiar_m2: { type: String },
    wielkosc_dzialki: { type: String },
    pokoje: { type: String },
    sypialnie: { type: String },
    id_nieruchomosci: { type: String },
    rok_budowy: { type: String },
    garaz: { type: String },
    wielkosc_garazu: { type: String },
    dostepna_od: { type: String },
    piwnica: { type: String },
    konstrukcja_zew: { type: String },
    material_elewacji: { type: String },
    dach: { type: String },
    typ_konstrukcji: { type: String },
    liczba_pieter: { type: String },
    uwagi: { type: String },
    klasa_energetyczna: { type: String },
    wskaznik_energetyczny: { type: String }
  },

  // Przypisanie do użytkownika
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Metadane
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: false }
});

// Aktualizacja cenaNum przed zapisem
propertySchema.pre('save', function(next) {
  // Konwertuj cenę tekstową na liczbę
  if (this.cena && !isNaN(parseFloat(this.cena))) {
    this.cenaNum = parseFloat(this.cena);
  } else {
    this.cenaNum = 0;
  }
  
  this.updatedAt = Date.now();
  next();
});

// Indeks dla lepszej wydajności zapytań
propertySchema.index({ user: 1, createdAt: -1 });
propertySchema.index({ isActive: 1 });
propertySchema.index({ cenaNum: 1 }); // DODANE - dla sortowania cen
propertySchema.index({ 'lokalizacja.wojewodztwo': 1 }); // DODANE - dla filtrowania

module.exports = mongoose.model('Property', propertySchema);  