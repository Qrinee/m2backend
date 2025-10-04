const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const User = require('../models/User');
const upload = require('../middleware/upload');
const { auth, optionalAuth, adminAuth } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');


router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;
    
    // Filtry
    const filters = { isActive: true };
    
    // Jeśli użytkownik jest zalogowany i chce zobaczyć swoje nieruchomości
    if (req.query.my === 'true' && req.user) {
      filters.user = req.user._id;
    }
    
    // Filtrowanie po kategorii
    if (req.query.kategoria) {
      filters.kategoria = req.query.kategoria;
    }
    
    // Filtrowanie po statusie (sprzedaż/wynajem)
    if (req.query.status) {
      filters.status = req.query.status;
    }

    // Filtrowanie po województwie
    if (req.query.wojewodztwo) {
      filters['lokalizacja.wojewodztwo'] = req.query.wojewodztwo;
    }

    // Filtrowanie po mieście
    if (req.query.miasto) {
      filters['lokalizacja.miasto'] = req.query.miasto;
    }

    // Wyszukiwanie po nazwie ogłoszenia
    if (req.query.search) {
      filters.nazwa = { $regex: req.query.search, $options: 'i' };
    }

    // Filtrowanie po typie ogłoszenia (sprzedaż/wynajem)
    if (req.query.typ) {
      if (req.query.typ === 'sprzedaz') {
        filters.status = 'na_sprzedaz';
      } else if (req.query.typ === 'wynajem') {
        filters.status = 'do_wynajecia';
      }
    }

    // Filtrowanie po cenie - zakres
    if (req.query.cenaMin || req.query.cenaMax) {
      filters.cenaNum = {};
      if (req.query.cenaMin) {
        filters.cenaNum.$gte = parseFloat(req.query.cenaMin);
      }
      if (req.query.cenaMax) {
        filters.cenaNum.$lte = parseFloat(req.query.cenaMax);
      }
    }

    // Filtrowanie po powierzchni
    if (req.query.powierzchniaMin || req.query.powierzchniaMax) {
      filters['szczegoly.rozmiar_m2'] = {};
      if (req.query.powierzchniaMin) {
        filters['szczegoly.rozmiar_m2'].$gte = req.query.powierzchniaMin;
      }
      if (req.query.powierzchniaMax) {
        filters['szczegoly.rozmiar_m2'].$lte = req.query.powierzchniaMax;
      }
    }

    // Filtrowanie po liczbie pokoi
    if (req.query.pokoje) {
      filters['szczegoly.pokoje'] = req.query.pokoje;
    }

    // Sortowanie
    let sortOptions = { createdAt: -1 };
    if (req.query.sort) {
      switch (req.query.sort) {
        case 'cena-asc':
          sortOptions = { cenaNum: 1 };
          break;
        case 'cena-desc':
          sortOptions = { cenaNum: -1 };
          break;
        case 'data-asc':
          sortOptions = { createdAt: 1 };
          break;
        case 'data-desc':
          sortOptions = { createdAt: -1 };
          break;
        case 'powierzchnia-asc':
          sortOptions = { 'szczegoly.rozmiar_m2': 1 };
          break;
        case 'powierzchnia-desc':
          sortOptions = { 'szczegoly.rozmiar_m2': -1 };
          break;
        default:
          sortOptions = { createdAt: -1 };
      }
    }

    const properties = await Property.find(filters)
      .populate('user', 'name surname email phone profilePicture')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    const total = await Property.countDocuments(filters);

    res.json({
      success: true,
      properties,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalProperties: total
    });
  } catch (error) {
    console.error('Błąd podczas pobierania nieruchomości:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas pobierania nieruchomości' 
    });
  }
});

// GET endpoint do pobrania dostępnych filtrów
router.get('/filters/options', async (req, res) => {
  try {
    const [
      kategorie,
      wojewodztwa,
      miasta,
      statusy
    ] = await Promise.all([
      Property.distinct('kategoria', { isActive: true }),
      Property.distinct('lokalizacja.wojewodztwo', { isActive: true }),
      Property.distinct('lokalizacja.miasto', { isActive: true }),
      Property.distinct('status', { isActive: true })
    ]);

    // Pobierz min i max cenę
    const priceStats = await Property.aggregate([
      { $match: { isActive: true, cenaNum: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          minPrice: { $min: '$cenaNum' },
          maxPrice: { $max: '$cenaNum' }
        }
      }
    ]);

    // Pobierz min i max powierzchnię
    const areaStats = await Property.aggregate([
      { $match: { isActive: true, 'szczegoly.rozmiar_m2': { $ne: null } } },
      {
        $group: {
          _id: null,
          minArea: { $min: '$szczegoly.rozmiar_m2' },
          maxArea: { $max: '$szczegoly.rozmiar_m2' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        kategorie: kategorie.filter(Boolean).sort(),
        wojewodztwa: wojewodztwa.filter(Boolean).sort(),
        miasta: miasta.filter(Boolean).sort(),
        statusy: statusy.filter(Boolean),
        cena: {
          min: priceStats[0]?.minPrice || 0,
          max: priceStats[0]?.maxPrice || 0
        },
        powierzchnia: {
          min: areaStats[0]?.minArea || 0,
          max: areaStats[0]?.maxArea || 0
        }
      }
    });
  } catch (error) {
    console.error('Błąd podczas pobierania opcji filtrów:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas pobierania opcji filtrów' 
    });
  }
});

// GET zaawansowane wyszukiwanie pełnotekstowe
router.get('/search/advanced', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;

    const {
      search,
      typ,
      kategoria,
      wojewodztwo,
      miasto,
      cenaMin,
      cenaMax,
      powierzchniaMin,
      powierzchniaMax,
      pokoje,
      sort
    } = req.query;

    const filters = { isActive: true };

    // Wyszukiwanie tekstowe w nazwie i opisie
    if (search) {
      filters.$or = [
        { nazwa: { $regex: search, $options: 'i' } },
        { opis: { $regex: search, $options: 'i' } },
        { 'lokalizacja.miasto': { $regex: search, $options: 'i' } },
        { 'lokalizacja.wojewodztwo': { $regex: search, $options: 'i' } }
      ];
    }

    // Filtry
    if (typ) {
      if (typ === 'sprzedaz') {
        filters.status = 'na_sprzedaz';
      } else if (typ === 'wynajem') {
        filters.status = 'do_wynajecia';
      }
    }

    if (kategoria) filters.kategoria = kategoria;
    if (wojewodztwo) filters['lokalizacja.wojewodztwo'] = wojewodztwo;
    if (miasto) filters['lokalizacja.miasto'] = miasto;
    if (pokoje) filters['szczegoly.pokoje'] = pokoje;

    // Filtry zakresowe
    if (cenaMin || cenaMax) {
      filters.cenaNum = {};
      if (cenaMin) filters.cenaNum.$gte = parseFloat(cenaMin);
      if (cenaMax) filters.cenaNum.$lte = parseFloat(cenaMax);
    }

    if (powierzchniaMin || powierzchniaMax) {
      filters['szczegoly.rozmiar_m2'] = {};
      if (powierzchniaMin) filters['szczegoly.rozmiar_m2'].$gte = powierzchniaMin;
      if (powierzchniaMax) filters['szczegoly.rozmiar_m2'].$lte = powierzchniaMax;
    }

    // Sortowanie
    let sortOptions = { createdAt: -1 };
    if (sort) {
      switch (sort) {
        case 'cena-asc':
          sortOptions = { cenaNum: 1 };
          break;
        case 'cena-desc':
          sortOptions = { cenaNum: -1 };
          break;
        case 'powierzchnia-asc':
          sortOptions = { 'szczegoly.rozmiar_m2': 1 };
          break;
        case 'powierzchnia-desc':
          sortOptions = { 'szczegoly.rozmiar_m2': -1 };
          break;
        default:
          sortOptions = { createdAt: -1 };
      }
    }

    const properties = await Property.find(filters)
      .populate('user', 'name surname email phone profilePicture')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    const total = await Property.countDocuments(filters);

    res.json({
      success: true,
      properties,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalProperties: total,
      filters: {
        search,
        typ,
        kategoria,
        wojewodztwo,
        miasto,
        cenaMin,
        cenaMax,
        powierzchniaMin,
        powierzchniaMax,
        pokoje,
        sort
      }
    });
  } catch (error) {
    console.error('Błąd podczas zaawansowanego wyszukiwania:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas wyszukiwania' 
    });
  }
});

// GET popularne wyszukiwania
router.get('/search/popular', async (req, res) => {
  try {
    // Możesz dodać logikę śledzenia popularnych wyszukiwań
    const popularSearches = [
      { term: 'Warszawa', count: 154 },
      { term: 'Kraków', count: 128 },
      { term: 'Wrocław', count: 97 },
      { term: 'mieszkanie', count: 203 },
      { term: 'dom', count: 156 },
      { term: 'nowe', count: 89 }
    ];

    res.json({
      success: true,
      data: popularSearches
    });
  } catch (error) {
    console.error('Błąd podczas pobierania popularnych wyszukiwań:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas pobierania popularnych wyszukiwań' 
    });
  }
});

// GET wszystkie nieruchomości z paginacją
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;
    
    // Filtry
    const filters = { isActive: true };
    
    // Jeśli użytkownik jest zalogowany i chce zobaczyć swoje nieruchomości
    if (req.query.my === 'true' && req.user) {
      filters.user = req.user._id;
    }
    
    // Filtrowanie po kategorii
    if (req.query.kategoria) {
      filters.kategoria = req.query.kategoria;
    }
    
    // Filtrowanie po statusie
    if (req.query.status) {
      filters.status = req.query.status;
    }

    const properties = await Property.find(filters)
      .populate('user', 'name surname email phone profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Property.countDocuments(filters);

    res.json({
      success: true,
      properties,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalProperties: total
    });
  } catch (error) {
    console.error('Błąd podczas pobierania nieruchomości:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas pobierania nieruchomości' 
    });
  }
});

// GET pojedyncza nieruchomość
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('user', 'name surname email phone profilePicture role');
    
    if (!property) {
      return res.status(404).json({ 
        success: false,
        error: 'Nieruchomość nie znaleziona' 
      });
    }
    
    // Sprawdź czy użytkownik jest właścicielem lub adminem
    if (req.user && (req.user._id.equals(property.user._id) || req.user.role === 'admin')) {
      // Zwróć pełne dane
      res.json({
        success: true,
        property,
        isOwner: true
      });
    } else {
      // Zwróć tylko publiczne dane
      const publicProperty = property.toObject();
      res.json({
        success: true,
        property: publicProperty,
        isOwner: false
      });
    }
  } catch (error) {
    console.error('Błąd podczas pobierania nieruchomości:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas pobierania nieruchomości' 
    });
  }
});

// POST nowa nieruchomość z plikami (wymaga autoryzacji)
router.post('/', auth, upload.array('files', 20), async (req, res) => {
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
      path: `uploads/${file.filename}`,
      mimetype: file.mimetype,
      size: file.size,
      isCover: index === 0
    })) : [];

    // Utworzenie nowej nieruchomości z przypisanym użytkownikiem
    const newProperty = new Property({
      ...parsedOpis,
      files: filesData,
      lokalizacja: parsedLokalizacja,
      szczegoly: parsedSzczegoly,
      user: req.user._id // Przypisanie do zalogowanego użytkownika
    });

    const savedProperty = await newProperty.save();
    
    // Populate user data before sending response
    await savedProperty.populate('user', 'name surname email phone profilePicture');
    
    res.status(201).json({
      success: true,
      property: savedProperty,
      message: 'Nieruchomość została dodana pomyślnie'
    });
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
      success: false,
      error: 'Błąd podczas zapisywania nieruchomości',
      details: error.message 
    });
  }
});

// PUT aktualizacja nieruchomości (tylko właściciel lub admin)
router.put('/:id', auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({ 
        success: false,
        error: 'Nieruchomość nie znaleziona' 
      });
    }

    // Sprawdź czy użytkownik jest właścicielem lub adminem
    if (!req.user._id.equals(property.user) && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Brak uprawnień do edycji tej nieruchomości' 
      });
    }

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
    ).populate('user', 'name surname email phone profilePicture');

    res.json({
      success: true,
      property: updatedProperty,
      message: 'Nieruchomość została zaktualizowana pomyślnie'
    });
  } catch (error) {
    console.error('Błąd podczas aktualizacji nieruchomości:', error);
    res.status(400).json({ 
      success: false,
      error: 'Błąd podczas aktualizacji nieruchomości',
      details: error.message 
    });
  }
});

// DELETE nieruchomość (soft delete) - tylko właściciel lub admin
router.delete('/:id', auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({ 
        success: false,
        error: 'Nieruchomość nie znaleziona' 
      });
    }

    // Sprawdź czy użytkownik jest właścicielem lub adminem
    if (!req.user._id.equals(property.user) && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Brak uprawnień do usunięcia tej nieruchomości' 
      });
    }

    const deletedProperty = await Property.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Nieruchomość usunięta pomyślnie',
      property: deletedProperty
    });
  } catch (error) {
    console.error('Błąd podczas usuwania nieruchomości:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas usuwania nieruchomości',
      details: error.message 
    });
  }
});

// GET nieruchomości konkretnego użytkownika
router.get('/user/:userId', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;

    const properties = await Property.find({ 
      user: req.params.userId,
      isActive: true 
    })
      .populate('user', 'name surname email phone profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Property.countDocuments({ 
      user: req.params.userId,
      isActive: true 
    });

    res.json({
      success: true,
      properties,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalProperties: total
    });
  } catch (error) {
    console.error('Błąd podczas pobierania nieruchomości użytkownika:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas pobierania nieruchomości' 
    });
  }
});

// Endpoint do ustawiania zdjęcia jako cover (tylko właściciel lub admin)
router.patch('/:id/cover', auth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({ 
        success: false,
        error: 'Nieruchomość nie znaleziona' 
      });
    }

    // Sprawdź czy użytkownik jest właścicielem lub adminem
    if (!req.user._id.equals(property.user) && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Brak uprawnień do edycji tej nieruchomości' 
      });
    }

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
    ).populate('user', 'name surname email phone profilePicture');

    if (!updatedProperty) {
      return res.status(404).json({ 
        success: false,
        error: 'Nieruchomość lub plik nie znaleziony' 
      });
    }

    res.json({
      success: true,
      property: updatedProperty,
      message: 'Zdjęcie główne zostało ustawione'
    });
  } catch (error) {
    console.error('Błąd podczas ustawiania zdjęcia głównego:', error);
    res.status(400).json({ 
      success: false,
      error: 'Błąd podczas ustawiania zdjęcia głównego',
      details: error.message 
    });
  }
});

module.exports = router;