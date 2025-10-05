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

    // Mapowanie danych do struktury oczekiwanej przez frontend
    const mappedBlogs = blogs.map(blog => ({
      _id: blog._id,
      title: blog.title,
      content: blog.text, // mapuj 'text' na 'content'
      excerpt: blog.shortText, // mapuj 'shortText' na 'excerpt'
      image: blog.imageSrc, // mapuj 'imageSrc' na 'image'
      date: blog.date,
      createdAt: blog.createdAt,
      updatedAt: blog.updatedAt
    }));

    res.json({
      success: true,
      data: mappedBlogs, // zmiana z 'blogs' na 'data'
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

    // Mapowanie danych
    const mappedBlog = {
      _id: blog._id,
      title: blog.title,
      content: blog.text,
      excerpt: blog.shortText,
      image: blog.imageSrc,
      date: blog.date,
      createdAt: blog.createdAt,
      updatedAt: blog.updatedAt
    };

    res.json({
      success: true,
      data: mappedBlog // zmiana z 'blog' na 'data'
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
    const { title, content, excerpt, date } = req.body; // zmiana nazw pól

    const blogData = {
      title,
      text: content, // mapuj 'content' na 'text'
      shortText: excerpt, // mapuj 'excerpt' na 'shortText'
      date: date || new Date()
    };

    if (req.file) {
      blogData.imageSrc = `/uploads/${req.file.filename}`; // dodaj slash na początku
    }

    const newBlog = new Blog(blogData);
    const savedBlog = await newBlog.save();

    // Mapowanie odpowiedzi
    const responseBlog = {
      _id: savedBlog._id,
      title: savedBlog.title,
      content: savedBlog.text,
      excerpt: savedBlog.shortText,
      image: savedBlog.imageSrc,
      date: savedBlog.date,
      createdAt: savedBlog.createdAt
    };

    res.status(201).json({
      success: true,
      data: responseBlog, // zmiana z 'blog' na 'data'
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
    const { title, content, excerpt, date } = req.body; // zmiana nazw pól

    const updateData = {
      title,
      text: content, // mapuj 'content' na 'text'
      shortText: excerpt, // mapuj 'excerpt' na 'shortText'
      date,
      updatedAt: new Date()
    };

    if (req.file) {
      updateData.imageSrc = `/uploads/${req.file.filename}`; // dodaj slash
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Mapowanie odpowiedzi
    const responseBlog = {
      _id: updatedBlog._id,
      title: updatedBlog.title,
      content: updatedBlog.text,
      excerpt: updatedBlog.shortText,
      image: updatedBlog.imageSrc,
      date: updatedBlog.date,
      updatedAt: updatedBlog.updatedAt
    };

    res.json({
      success: true,
      data: responseBlog, // zmiana z 'blog' na 'data'
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