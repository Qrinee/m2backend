const express = require('express');
const router = express.Router();
const Blog = require('../models/Blog');
const upload = require('../middleware/upload');
const { auth, optionalAuth, adminAuth } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

// GET wszystkie wpisy bloga z paginacją i filtrami
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;
    
    // Filtry
    const filters = {};
    
    // Wyszukiwanie po tytule
    if (req.query.search) {
      filters.title = { $regex: req.query.search, $options: 'i' };
    }

    // Filtrowanie po dacie
    if (req.query.dateFrom || req.query.dateTo) {
      filters.date = {};
      if (req.query.dateFrom) {
        filters.date.$gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo) {
        filters.date.$lte = new Date(req.query.dateTo);
      }
    }

    // Sortowanie
    let sortOptions = { date: -1 };
    if (req.query.sort) {
      switch (req.query.sort) {
        case 'date-asc':
          sortOptions = { date: 1 };
          break;
        case 'date-desc':
          sortOptions = { date: -1 };
          break;
        case 'title-asc':
          sortOptions = { title: 1 };
          break;
        case 'title-desc':
          sortOptions = { title: -1 };
          break;
        default:
          sortOptions = { date: -1 };
      }
    }

    const blogs = await Blog.find(filters)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    const total = await Blog.countDocuments(filters);

    res.json({
      success: true,
      blogs,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalBlogs: total
    });
  } catch (error) {
    console.error('Błąd podczas pobierania wpisów bloga:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas pobierania wpisów bloga' 
    });
  }
});

// GET pojedynczy wpis bloga
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ 
        success: false,
        error: 'Wpis bloga nie znaleziony' 
      });
    }

    res.json({
      success: true,
      blog
    });
  } catch (error) {
    console.error('Błąd podczas pobierania wpisu bloga:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas pobierania wpisu bloga' 
    });
  }
});

// POST nowy wpis bloga (wymaga autoryzacji admina)
router.post('/', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const { title, text, date } = req.body;

    // Przygotowanie danych
    const blogData = {
      title,
      text,
      date: date || new Date()
    };

    // Dodanie obrazka jeśli został przesłany
    if (req.file) {
      blogData.imageSrc = `uploads/${req.file.filename}`;
    }

    // Utworzenie nowego wpisu bloga
    const newBlog = new Blog(blogData);
    const savedBlog = await newBlog.save();

    res.status(201).json({
      success: true,
      blog: savedBlog,
      message: 'Wpis bloga został dodany pomyślnie'
    });
  } catch (error) {
    console.error('Błąd podczas zapisywania wpisu bloga:', error);
    
    // Usuń przesłany plik jeśli zapis się nie powiódł
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(400).json({ 
      success: false,
      error: 'Błąd podczas zapisywania wpisu bloga',
      details: error.message 
    });
  }
});

// PUT aktualizacja wpisu bloga (tylko admin)
router.put('/:id', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ 
        success: false,
        error: 'Wpis bloga nie znaleziony' 
      });
    }

    const { title, text, date } = req.body;

    const updateData = {
      title,
      text,
      date,
      updatedAt: new Date()
    };

    // Aktualizacja obrazka jeśli został przesłany nowy
    if (req.file) {
      // Usuń stary obrazek jeśli istnieje
      if (blog.imageSrc && fs.existsSync(blog.imageSrc)) {
        fs.unlinkSync(blog.imageSrc);
      }
      updateData.imageSrc = `uploads/${req.file.filename}`;
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      blog: updatedBlog,
      message: 'Wpis bloga został zaktualizowany pomyślnie'
    });
  } catch (error) {
    console.error('Błąd podczas aktualizacji wpisu bloga:', error);
    
    // Usuń przesłany plik jeśli aktualizacja się nie powiodła
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(400).json({ 
      success: false,
      error: 'Błąd podczas aktualizacji wpisu bloga',
      details: error.message 
    });
  }
});

// DELETE wpis bloga (tylko admin)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({ 
        success: false,
        error: 'Wpis bloga nie znaleziony' 
      });
    }

    // Usuń obrazek jeśli istnieje
    if (blog.imageSrc && fs.existsSync(blog.imageSrc)) {
      fs.unlinkSync(blog.imageSrc);
    }

    await Blog.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Wpis bloga usunięty pomyślnie'
    });
  } catch (error) {
    console.error('Błąd podczas usuwania wpisu bloga:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas usuwania wpisu bloga',
      details: error.message 
    });
  }
});

// GET archiwum bloga (grupowanie po miesiącach)
router.get('/archive/years', async (req, res) => {
  try {
    const archiveYears = await Blog.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: {
          '_id.year': -1,
          '_id.month': -1
        }
      }
    ]);

    res.json({
      success: true,
      archive: archiveYears
    });
  } catch (error) {
    console.error('Błąd podczas pobierania archiwum:', error);
    res.status(500).json({ 
      success: false,
      error: 'Błąd podczas pobierania archiwum' 
    });
  }
});

module.exports = router;