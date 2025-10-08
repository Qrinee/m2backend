const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const upload = require('../middleware/upload');
const { auth, optionalAuth, adminAuth } = require('../middleware/auth');
const fs = require('fs');

// GET wszystkie nieruchomości z paginacją i filtrami
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
      delete filters.isActive; // Pokazuj wszystkie nieruchomości użytkownika
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
        filters['szczegoly.rozmiar_m2'].$gte = parseFloat(req.query.powierzchniaMin);
      }
      if (req.query.powierzchniaMax) {
        filters['szczegoly.rozmiar_m2'].$lte = parseFloat(req.query.powierzchniaMax);
      }
    }

    // Filtrowanie po liczbie pokoi
    if (req.query.pokoje) {
      filters['szczegoly.pokoje'] = parseInt(req.query.pokoje);
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
      { $match: { isActive: true, 'szczegoly.rozmiar_m2': { $ne: null, $ne: '' } } },
      {
        $addFields: {
          rozmiarNum: { $toDouble: '$szczegoly.rozmiar_m2' }
        }
      },
      {
        $match: {
          rozmiarNum: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          minArea: { $min: '$rozmiarNum' },
          maxArea: { $max: '$rozmiarNum' }
        }
      }
    ]);

    // Pobierz dostępne liczby pokoi
    const pokojeOptions = await Property.aggregate([
      { $match: { isActive: true, 'szczegoly.pokoje': { $ne: null, $ne: '' } } },
      {
        $group: {
          _id: '$szczegoly.pokoje'
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        kategorie: kategorie.filter(Boolean).sort(),
        wojewodztwa: wojewodztwa.filter(Boolean).sort(),
        miasta: miasta.filter(Boolean).sort(),
        statusy: statusy.filter(Boolean),
        pokoje: pokojeOptions.map(p => p._id).filter(Boolean).sort((a, b) => a - b),
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
    if (pokoje) filters['szczegoly.pokoje'] = parseInt(pokoje);

    // Filtry zakresowe
    if (cenaMin || cenaMax) {
      filters.cenaNum = {};
      if (cenaMin) filters.cenaNum.$gte = parseFloat(cenaMin);
      if (cenaMax) filters.cenaNum.$lte = parseFloat(cenaMax);
    }

    if (powierzchniaMin || powierzchniaMax) {
      filters['szczegoly.rozmiar_m2'] = {};
      if (powierzchniaMin) filters['szczegoly.rozmiar_m2'].$gte = parseFloat(powierzchniaMin);
      if (powierzchniaMax) filters['szczegoly.rozmiar_m2'].$lte = parseFloat(powierzchniaMax);
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

// GET wszystkie nieruchomości dla admina (bez filtrów aktywności)
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const properties = await Property.find({})
      .populate('user', 'name surname email phone profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Property.countDocuments({});

    res.json({
      success: true,
      properties,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalProperties: total
    });
  } catch (error) {
    console.error('Błąd podczas pobierania nieruchomości dla admina:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas pobierania nieruchomości' 
    });
  }
});

// PUT zmiana statusu aktywności przez admina
router.put('/admin/:id/status', adminAuth, async (req, res) => {
  try {
    const { isActive } = req.body;

    const property = await Property.findByIdAndUpdate(
      req.params.id,
      { isActive, updatedAt: new Date() },
      { new: true }
    ).populate('user', 'name surname email phone profilePicture');

    if (!property) {
      return res.status(404).json({ 
        success: false,
        error: 'Nieruchomość nie znaleziona' 
      });
    }

    res.json({
      success: true,
      property,
      message: `Nieruchomość ${isActive ? 'aktywowana' : 'deaktywowana'} pomyślnie`
    });
  } catch (error) {
    console.error('Błąd podczas zmiany statusu nieruchomości:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas zmiany statusu nieruchomości' 
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

// GET pojedyncza nieruchomość
// GET pojedyncza nieruchomość
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('user', 'name surname email contactEmail phone profilePicture role'); // DODAJ contactEmail

    if (!property) {
      return res.status(404).json({ success: false, error: 'Nieruchomość nie znaleziona' });
    }

    // Sprawdź czy użytkownik jest właścicielem lub adminem
    let isOwner = false;
    if (req.user) {
      isOwner = req.user._id.equals(property.user._id) || req.user.role === 'admin';
    }

    // Jeśli nie jest właścicielem/adminem i nieruchomość nie jest aktywna, zwróć błąd
    if (!isOwner && !property.isActive) {
      return res.status(404).json({ success: false, error: 'Nieruchomość nie znaleziona' });
    }

    res.json({ success: true, property, isOwner });
  } catch (error) {
    console.error('Błąd podczas pobierania nieruchomości:', error);
    res.status(500).json({ success: false, error: 'Błąd podczas pobierania nieruchomości' });
  }
});

// POST nowa nieruchomość z plikami (wymaga autoryzacji)
router.post('/', auth, upload.array('files', 20), async (req, res) => {
  try {
    const { opis, lokalizacja, szczegoly } = req.body;

    if (!opis || !lokalizacja) {
      return res.status(400).json({
        success: false,
        error: 'Brak wymaganych danych: opis i lokalizacja'
      });
    }

    // Parsowanie danych z formularza
    let parsedOpis, parsedLokalizacja, parsedSzczegoly;
    
    try {
      parsedOpis = typeof opis === 'string' ? JSON.parse(opis) : opis;
      parsedLokalizacja = typeof lokalizacja === 'string' ? JSON.parse(lokalizacja) : lokalizacja;
      parsedSzczegoly = typeof szczegoly === 'string' ? JSON.parse(szczegoly) : (szczegoly || {});
    } catch (parseError) {
      console.error('Błąd parsowania JSON:', parseError);
      return res.status(400).json({
        success: false,
        error: 'Nieprawidłowy format danych JSON'
      });
    }

    // Walidacja wymaganych pól
    if (!parsedOpis.nazwa || !parsedLokalizacja.adres) {
      return res.status(400).json({
        success: false,
        error: 'Wymagane pola: nazwa i adres'
      });
    }

    // Przygotowanie danych plików
    const filesData = req.files ? req.files.map((file, index) => ({
      filename: file.filename,
      originalName: file.originalname,
      path: `uploads/${file.filename}`,
      mimetype: file.mimetype,
      size: file.size,
      isCover: index === 0 // pierwszy plik jako cover
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
        const filePath = `uploads/${file.filename}`;
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (unlinkError) {
            console.error('Błąd podczas usuwania pliku:', unlinkError);
          }
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

    // Parsowanie danych
    let parsedOpis, parsedLokalizacja, parsedSzczegoly;
    
    try {
      parsedOpis = typeof opis === 'string' ? JSON.parse(opis) : opis;
      parsedLokalizacja = typeof lokalizacja === 'string' ? JSON.parse(lokalizacja) : lokalizacja;
      parsedSzczegoly = typeof szczegoly === 'string' ? JSON.parse(szczegoly) : (szczegoly || {});
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Nieprawidłowy format danych JSON'
      });
    }

    const updateData = {
      ...parsedOpis,
      lokalizacja: parsedLokalizacja,
      szczegoly: parsedSzczegoly,
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

    // Dla zalogowanego użytkownika pokazuj wszystkie jego nieruchomości
    // Dla innych użytkowników tylko aktywne
    const filters = { user: req.params.userId };
    if (!req.user || !req.user._id.equals(req.params.userId)) {
      filters.isActive = true;
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
    
    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: 'Brak ID pliku'
      });
    }

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

// GET statystyki nieruchomości (dla admina)
router.get('/admin/stats', adminAuth, async (req, res) => {
  try {
    const totalProperties = await Property.countDocuments();
    const activeProperties = await Property.countDocuments({ isActive: true });
    const propertiesByCategory = await Property.aggregate([
      {
        $group: {
          _id: '$kategoria',
          count: { $sum: 1 }
        }
      }
    ]);
    const propertiesByStatus = await Property.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        totalProperties,
        activeProperties,
        inactiveProperties: totalProperties - activeProperties,
        byCategory: propertiesByCategory,
        byStatus: propertiesByStatus
      }
    });
  } catch (error) {
    console.error('Błąd podczas pobierania statystyk:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd podczas pobierania statystyk'
    });
  }
});

module.exports = router;