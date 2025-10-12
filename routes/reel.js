const express = require('express');
const router = express.Router();
const Reel = require('../models/Reel');
const upload = require('../middleware/uploadVideo');
const { auth, adminAuth } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

// GET wszystkie reels (dla admina z filtrami, dla użytkowników tylko opublikowane)
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Filtry
    const filters = {};

    // Dla zwykłych użytkowników pokazuj tylko opublikowane
    // Dla adminów pokazuj wszystkie (chyba że wyraźnie przefiltrują)
    if (req.user.role !== 'admin') {
      filters.isPublished = true;
    } else {
      // Admin może filtrować po statusie publikacji
      if (req.query.isPublished !== undefined) {
        filters.isPublished = req.query.isPublished === 'true';
      }
    }

    // Filtry dla admina
    if (req.user.role === 'admin') {
      if (req.query.featured !== undefined) {
        filters.featured = req.query.featured === 'true';
      }
    }

    // Sortowanie
    let sortOptions = { createdAt: -1 };
    if (req.query.sort === 'featured') {
      sortOptions = { featured: -1, createdAt: -1 };
    }

    const reels = await Reel.find(filters)
      .populate('user', 'name surname profilePicture')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    const total = await Reel.countDocuments(filters);

    res.json({
      success: true,
      reels,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalReels: total,
      // Informacja dla frontendu czy użytkownik jest adminem
      isAdmin: req.user.role === 'admin'
    });
  } catch (error) {
    console.error('Błąd podczas pobierania reelów:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd podczas pobierania reelów'
    });
  }
});


router.get('/public/all', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const filters = {
      isPublished: true
    };

    // Filtry opcjonalne
    if (req.query.featured === 'true') {
      filters.featured = true;
    }

    const reels = await Reel.find(filters)
      .populate('user', 'name surname profilePicture')
      .sort({ featured: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Reel.countDocuments(filters);

    res.json({
      success: true,
      reels,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalReels: total
    });
  } catch (error) {
    console.error('Błąd podczas pobierania publicznych reelów:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd podczas pobierania reelów'
    });
  }
});

// GET pojedynczy reel
router.get('/:id', async (req, res) => {
  try {
    const reel = await Reel.findById(req.params.id)
      .populate('user', 'name surname profilePicture');

    if (!reel) {
      return res.status(404).json({
        success: false,
        error: 'Reel nie znaleziony'
      });
    }

    // Sprawdź uprawnienia - tylko admin lub właściciel może widzieć nieopublikowane
    let canEdit = false;
    if (req.user) {
      canEdit = req.user._id.equals(reel.user._id) || req.user.role === 'admin';
    }

    if (!reel.isPublished && !canEdit) {
      return res.status(404).json({
        success: false,
        error: 'Reel nie znaleziony'
      });
    }

    res.json({
      success: true,
      reel,
      canEdit
    });
  } catch (error) {
    console.error('Błąd podczas pobierania reel:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd podczas pobierania reel'
    });
  }
});

// POST nowy reel
router.post('/', auth, upload.single('video'), async (req, res) => {
  try {
    const { title, description, isPublished, featured } = req.body;

    // Walidacja wymaganych pól
    if (!title || !req.file) {
      return res.status(400).json({
        success: false,
        error: 'Brak wymaganych pól: tytuł i film wideo'
      });
    }

    // Utworzenie nowego reel
    const newReel = new Reel({
      title,
      description: description || '',
      videoUrl: `uploads/reels/${req.file.filename}`,
      isPublished: isPublished === 'true',
      featured: featured === 'true',
      user: req.user._id
    });

    const savedReel = await newReel.save();
    await savedReel.populate('user', 'name surname profilePicture');

    res.status(201).json({
      success: true,
      reel: savedReel,
      message: 'Reel został dodany pomyślnie'
    });
  } catch (error) {
    console.error('Błąd podczas zapisywania reel:', error);

    // Usuń przesłany plik w przypadku błędu
    if (req.file) {
      const filePath = `uploads/reels/${req.file.filename}`;
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkError) {
          console.error('Błąd podczas usuwania pliku:', unlinkError);
        }
      }
    }

    res.status(400).json({
      success: false,
      error: 'Błąd podczas zapisywania reel',
      details: error.message
    });
  }
});

// PUT aktualizacja reel
router.put('/:id', auth, upload.single('video'), async (req, res) => {
  try {
    const reel = await Reel.findById(req.params.id);

    if (!reel) {
      return res.status(404).json({
        success: false,
        error: 'Reel nie znaleziony'
      });
    }

    // Sprawdź uprawnienia
    if (!req.user._id.equals(reel.user) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Brak uprawnień do edycji tego reel'
      });
    }

    const { title, description, isPublished, featured } = req.body;
    const updateData = {
      title,
      description,
      isPublished: isPublished === 'true',
      featured: featured === 'true'
    };

    // Jeśli przesłano nowy film, zaktualizuj ścieżkę
    if (req.file) {
      // Usuń stary plik wideo
      if (reel.videoUrl && fs.existsSync(reel.videoUrl)) {
        try {
          fs.unlinkSync(reel.videoUrl);
        } catch (unlinkError) {
          console.error('Błąd podczas usuwania starego pliku wideo:', unlinkError);
        }
      }
      updateData.videoUrl = `uploads/reels/${req.file.filename}`;
    }

    const updatedReel = await Reel.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('user', 'name surname profilePicture');

    res.json({
      success: true,
      reel: updatedReel,
      message: 'Reel został zaktualizowany pomyślnie'
    });
  } catch (error) {
    console.error('Błąd podczas aktualizacji reel:', error);
    res.status(400).json({
      success: false,
      error: 'Błąd podczas aktualizacji reel',
      details: error.message
    });
  }
});

// PATCH zmiana statusu publikacji
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { isPublished } = req.body;
    const reel = await Reel.findById(req.params.id);

    if (!reel) {
      return res.status(404).json({
        success: false,
        error: 'Reel nie znaleziony'
      });
    }

    // Sprawdź uprawnienia
    if (!req.user._id.equals(reel.user) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Brak uprawnień do zmiany statusu'
      });
    }

    const updatedReel = await Reel.findByIdAndUpdate(
      req.params.id,
      { isPublished },
      { new: true }
    ).populate('user', 'name surname profilePicture');

    res.json({
      success: true,
      reel: updatedReel,
      message: `Status publikacji zmieniony na ${isPublished ? 'opublikowany' : 'szkic'}`
    });
  } catch (error) {
    console.error('Błąd podczas zmiany statusu:', error);
    res.status(400).json({
      success: false,
      error: 'Błąd podczas zmiany statusu',
      details: error.message
    });
  }
});

// DELETE reel
router.delete('/:id', auth, async (req, res) => {
  try {
    const reel = await Reel.findById(req.params.id);

    if (!reel) {
      return res.status(404).json({
        success: false,
        error: 'Reel nie znaleziony'
      });
    }

    // Sprawdź uprawnienia
    if (!req.user._id.equals(reel.user) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Brak uprawnień do usunięcia tego reel'
      });
    }

    await Reel.findByIdAndDelete(req.params.id);

    // Usuń plik wideo
    if (reel.videoUrl && fs.existsSync(reel.videoUrl)) {
      try {
        fs.unlinkSync(reel.videoUrl);
      } catch (unlinkError) {
        console.error('Błąd podczas usuwania pliku wideo:', unlinkError);
      }
    }

    res.json({
      success: true,
      message: 'Reel usunięty pomyślnie'
    });
  } catch (error) {
    console.error('Błąd podczas usuwania reel:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd podczas usuwania reel',
      details: error.message
    });
  }
});

// GET reels użytkownika
router.get('/user/moje', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const filters = { user: req.user._id };

    // Filtrowanie po statusie jeśli podane
    if (req.query.isPublished !== undefined) {
      filters.isPublished = req.query.isPublished === 'true';
    }

    const reels = await Reel.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Reel.countDocuments(filters);

    res.json({
      success: true,
      reels,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalReels: total
    });
  } catch (error) {
    console.error('Błąd podczas pobierania reelów użytkownika:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd podczas pobierania reelów'
    });
  }
});

// GET statystyki dla admina
router.get('/admin/stats', adminAuth, async (req, res) => {
  try {
    const stats = await Reel.aggregate([
      {
        $group: {
          _id: '$isPublished',
          count: { $sum: 1 }
        }
      }
    ]);

    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const newThisWeek = await Reel.countDocuments({
      createdAt: { $gte: weekAgo }
    });

    const featuredCount = await Reel.countDocuments({ featured: true });

    res.json({
      success: true,
      stats: {
        byStatus: stats,
        newThisWeek,
        featuredCount,
        total: stats.reduce((acc, curr) => acc + curr.count, 0)
      }
    });
  } catch (error) {
    console.error('Błąd podczas pobierania statystyk reelów:', error);
    res.status(500).json({
      success: false,
      error: 'Błąd podczas pobierania statystyk'
    });
  }
});

module.exports = router;