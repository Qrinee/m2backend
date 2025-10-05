const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const blogSchema = new mongoose.Schema({

  imageSrc: {
    type: String,
  },
   title: {
    type: String,
  },
  excerpt: {
    type: String,
  },
  date: {
     type: Date, 
     default: Date.now 
  },
  text:{
    type: String,
    required: true
  }
}, {
  timestamps: true
});


module.exports = mongoose.model('Blog', blogSchema);