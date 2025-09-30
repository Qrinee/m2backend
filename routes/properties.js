const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const upload = require('../middleware/upload');
const fs = require('fs');
const path = require('path');

// GET wszystkie nieruchomości
router.get('/', async (req, res) => {
  try {
    const properties = await Property.find({ isActive: true })
      .sort({ createdAt: -1 });
    res.json(properties);
  } catch (error) {
    res.status(500).json({ error: 'Błąd podczas pobierania nieruchomości' });
  }
});

// GET pojedyncza nieruchomość
router.get('/:id', async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({ error: 'Nieruchomość nie znaleziona' });
    }
    res.json(property);
  } catch (error) {
    res.status(500).json({ error: 'Błąd podczas pobierania nieruchomości' });
  }
});

// POST nowa nieruchomość z plikami
router.post('/', upload.array('files', 20), async (req, res) => {
  try {
    const { opis, lokalizacja, szczegoly } = req.body;

    // Parsowanie danych z formularza
    const parsedOpis = typeof opis === 'string' ? JSON.parse(opis) : opis;
    const parsedLokalizacja = typeof lokalizacja === 'string' ? JSON.parse(lokalizacja) : lokalizacja;
    const parsedSzczegoly = typeof szczegoly === 'string' ? JSON.parse(szczegoly) : szczegoly;

    // Przygotowanie danych plików
    const filesData = req.files ? req.files.map((file, index) => ({
      filename: file.filename,
      originalName: file.originalname,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size,
      isCover: index === 0 // Pierwszy plik jako domyślny cover
    })) : [];

    // Utworzenie nowej nieruchomości
    const newProperty = new Property({
      ...parsedOpis,
      files: filesData,
      lokalizacja: parsedLokalizacja,
      szczegoly: parsedSzczegoly
    });

    const savedProperty = await newProperty.save();
    res.status(201).json(savedProperty);
  } catch (error) {
    console.error('Błąd podczas zapisywania nieruchomości:', error);
    
    // Usuń przesłane pliki jeśli zapis się nie powiódł
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(400).json({ 
      error: 'Błąd podczas zapisywania nieruchomości',
      details: error.message 
    });
  }
});

// PUT aktualizacja nieruchomości
router.put('/:id', async (req, res) => {
  try {
    const { opis, lokalizacja, szczegoly } = req.body;

    const updateData = {
      ...opis,
      lokalizacja,
      szczegoly,
      updatedAt: new Date()
    };

    const updatedProperty = await Property.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedProperty) {
      return res.status(404).json({ error: 'Nieruchomość nie znaleziona' });
    }

    res.json(updatedProperty);
  } catch (error) {
    res.status(400).json({ error: 'Błąd podczas aktualizacji nieruchomości' });
  }
});

// DELETE nieruchomość (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const deletedProperty = await Property.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );

    if (!deletedProperty) {
      return res.status(404).json({ error: 'Nieruchomość nie znaleziona' });
    }

    res.json({ message: 'Nieruchomość usunięta pomyślnie' });
  } catch (error) {
    res.status(500).json({ error: 'Błąd podczas usuwania nieruchomości' });
  }
});

// Endpoint do ustawiania zdjęcia jako cover
router.patch('/:id/cover', async (req, res) => {
  try {
    const { fileId } = req.body;
    
    // Najpierw ustaw wszystkie isCover na false
    await Property.updateOne(
      { _id: req.params.id },
      { $set: { 'files.$[].isCover': false } }
    );

    // Potem ustaw wybrany plik jako cover
    const updatedProperty = await Property.findOneAndUpdate(
      { _id: req.params.id, 'files._id': fileId },
      { $set: { 'files.$.isCover': true } },
      { new: true }
    );

    if (!updatedProperty) {
      return res.status(404).json({ error: 'Nieruchomość lub plik nie znaleziony' });
    }

    res.json(updatedProperty);
  } catch (error) {
    res.status(400).json({ error: 'Błąd podczas ustawiania zdjęcia głównego' });
  }
});

module.exports = router;