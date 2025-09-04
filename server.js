const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'build')));

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './'); // Save to current directory where Python scripts are
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  }
});

// Configure multer for CSV upload (processed files)
const csvStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const datasetId = req.params.datasetId || generateDatasetId();
    const datasetDir = path.join(__dirname, 'datasets', datasetId);
    fs.mkdir(datasetDir, { recursive: true }).then(() => {
      cb(null, datasetDir);
    }).catch(err => cb(err));
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const csvUpload = multer({ 
  storage: csvStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Helper function to run Python script
function runPythonScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    // Use virtual environment Python if available, otherwise fallback to python3
    const pythonCmd = process.env.NODE_ENV === 'production' ? '/opt/venv/bin/python' : 'python3';
    const pythonProcess = spawn(pythonCmd, [scriptPath, ...args], {
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(data.toString());
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(data.toString());
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
      }
    });
  });
}

// Generate unique dataset ID
function generateDatasetId(filename) {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  const hash = crypto.createHash('md5').update(filename).digest('hex').substring(0, 8);
  return `${timestamp}_${hash}`;
}

// API endpoint for file upload and processing
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filename = req.file.filename;
    const datasetId = generateDatasetId(filename);
    // Use current working directory instead of __dirname for Railway compatibility
    const parentDir = process.cwd();
    const datasetsDir = path.join(parentDir, 'datasets');
    const datasetDir = path.join(datasetsDir, datasetId);
    
    console.log(`Processing file: ${filename} -> Dataset ID: ${datasetId}`);
    console.log(`Current working directory: ${process.cwd()}`);
    console.log(`__dirname: ${__dirname}`);
    console.log(`datasetsDir: ${datasetsDir}`);

    // Create dataset directory
    try {
      await fs.mkdir(datasetsDir, { recursive: true });
      await fs.mkdir(datasetDir, { recursive: true });
      console.log(`Directories created successfully`);
    } catch (dirError) {
      console.error('Error creating directories:', dirError);
      return res.status(500).json({ error: 'Failed to create dataset directory', details: dirError.message });
    }

    // Create metadata
    const metadata = {
      id: datasetId,
      filename: filename,
      uploadTime: new Date().toISOString(),
      status: 'processing',
      steps: {
        excel_processed: false,
        extraction_completed: false
      }
    };
    
    await fs.writeFile(path.join(datasetDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    // Step 1: Update process_excel.py to use uploaded filename and dataset paths
    const processExcelPath = path.join(parentDir, 'process_excel.py');
    let processExcelContent = await fs.readFile(processExcelPath, 'utf8');
    
    // Replace the hardcoded filename and output path
    processExcelContent = processExcelContent.replace(
      /input_file = "[^"]*\.xlsx"/,
      `input_file = "${filename}"`
    );
    processExcelContent = processExcelContent.replace(
      /output_file = "[^"]*\.csv"/,
      `output_file = "${path.join(datasetDir, 'clean.csv').replace(/\\/g, '/')}"`
    );
    
    await fs.writeFile(processExcelPath, processExcelContent);

    // Step 2: Run process_excel.py
    console.log('Running process_excel.py...');
    let result1;
    try {
      result1 = await runPythonScript('process_excel.py');
      console.log('process_excel.py completed successfully');
      console.log('stdout:', result1.stdout);
      if (result1.stderr) {
        console.log('stderr:', result1.stderr);
      }
    } catch (pythonError) {
      console.error('Error running process_excel.py:', pythonError);
      return res.status(500).json({ 
        error: 'Failed to process Excel file', 
        details: pythonError.message,
        step: 'excel_processing'
      });
    }
    
    // Update metadata
    metadata.steps.excel_processed = true;
    await fs.writeFile(path.join(datasetDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    
    res.json({ 
      message: 'Excel processing started successfully',
      datasetId: datasetId,
      step: 'excel_processed',
      output: result1.stdout
    });

    // Step 3: Run extraction in background
    console.log('Starting extract_video_info_fast.py...');
    try {
      // Update extraction script to use dataset-specific paths
      const extractPath = path.join(parentDir, 'extract_video_info_fast.py');
      let extractContent = await fs.readFile(extractPath, 'utf8');
      
      extractContent = extractContent.replace(
        /csv_file = "[^"]*\.csv"/,
        `csv_file = "${path.join(datasetDir, 'clean.csv').replace(/\\/g, '/')}"`
      );
      extractContent = extractContent.replace(
        /output_file = "[^"]*\.csv"/,
        `output_file = "${path.join(datasetDir, 'extracted.csv').replace(/\\/g, '/')}"`
      );
      
      await fs.writeFile(extractPath, extractContent);
      
      const result2 = await runPythonScript('extract_video_info_fast.py');
      console.log('Video extraction completed:', result2.stdout);
      
      // Update metadata
      metadata.status = 'completed';
      metadata.steps.extraction_completed = true;
      metadata.completedTime = new Date().toISOString();
      await fs.writeFile(path.join(datasetDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      
      // Copy to public folder for current viewing
      const sourcePath = path.join(datasetDir, 'extracted.csv');
      const destPath = path.join(__dirname, 'public', 'videa_s_extrahovanymi_info.csv');
      
      try {
        await fs.copyFile(sourcePath, destPath);
        console.log('CSV file copied to public folder');
      } catch (copyError) {
        console.error('Error copying CSV file:', copyError);
      }
      
    } catch (extractError) {
      console.error('Video extraction failed:', extractError);
      metadata.status = 'error';
      metadata.error = extractError.message;
      await fs.writeFile(path.join(datasetDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    }

  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ error: 'Processing failed: ' + error.message });
  }
});

// API endpoint to check processing status
app.get('/api/status', async (req, res) => {
  try {
    const parentDir = path.join(__dirname, '../');
    const csvPath = path.join(parentDir, 'videa_s_extrahovanymi_info.csv');
    
    try {
      await fs.access(csvPath);
      res.json({ status: 'completed', message: 'Processing completed successfully' });
    } catch {
      res.json({ status: 'processing', message: 'Still processing videos...' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error checking status: ' + error.message });
  }
});

// API endpoint for progress tracking
app.get('/api/progress', async (req, res) => {
  try {
    const parentDir = path.join(__dirname, '../');
    const progressPath = path.join(parentDir, 'progress.json');
    
    try {
      const progressData = await fs.readFile(progressPath, 'utf8');
      const progress = JSON.parse(progressData);
      res.json(progress);
    } catch (error) {
      // Default progress if file doesn't exist
      res.json({ 
        current: 0, 
        total: 0, 
        status: 'idle', 
        message: 'Čekání na spuštění',
        percentage: 0 
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error reading progress: ' + error.message });
  }
});

// API endpoint to list all datasets
app.get('/api/datasets', async (req, res) => {
  try {
    const datasetsDir = path.join(__dirname, 'datasets');
    
    try {
      const datasets = [];
      const entries = await fs.readdir(datasetsDir);
      
      for (const entry of entries) {
        const entryPath = path.join(datasetsDir, entry);
        const stat = await fs.stat(entryPath);
        
        if (stat.isDirectory()) {
          const metadataPath = path.join(entryPath, 'metadata.json');
          try {
            const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
            datasets.push(metadata);
          } catch (metaError) {
            console.error(`Error reading metadata for ${entry}:`, metaError);
          }
        }
      }
      
      // Sort by upload time (newest first)
      datasets.sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime));
      
      res.json(datasets);
    } catch (dirError) {
      // Directory doesn't exist yet
      res.json([]);
    }
  } catch (error) {
    res.status(500).json({ error: 'Error listing datasets: ' + error.message });
  }
});

// API endpoint to switch to a specific dataset
app.post('/api/datasets/:id/activate', async (req, res) => {
  try {
    const datasetId = req.params.id;
    const datasetsDir = path.join(__dirname, 'datasets');
    const datasetDir = path.join(datasetsDir, datasetId);
    const extractedPath = path.join(datasetDir, 'extracted.csv');
    const publicPath = path.join(__dirname, 'public', 'videa_s_extrahovanymi_info.csv');
    
    // Check if extracted data exists
    try {
      await fs.access(extractedPath);
      await fs.copyFile(extractedPath, publicPath);
      res.json({ message: 'Dataset activated successfully', datasetId: datasetId });
    } catch (fileError) {
      res.status(404).json({ error: 'Dataset extracted data not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error activating dataset: ' + error.message });
  }
});

// Serve CSV files from datasets directory
app.get('/datasets/:datasetId/:filename', async (req, res) => {
  try {
    const { datasetId, filename } = req.params;
    const filePath = path.join(__dirname, 'datasets', datasetId, filename);
    
    // Check if file exists
    try {
      await fs.access(filePath);
      res.sendFile(filePath);
    } catch (error) {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error serving file: ' + error.message });
  }
});

// Upload processed CSV file
app.post('/api/upload-csv/:datasetId', csvUpload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    const datasetId = req.params.datasetId;
    const datasetDir = path.join(__dirname, 'datasets', datasetId);
    
    // Create metadata for the dataset
    const metadata = {
      id: datasetId,
      filename: req.file.originalname,
      uploadDate: new Date().toISOString(),
      type: 'csv_upload',
      status: 'completed'
    };

    // Save metadata
    await fs.writeFile(
      path.join(datasetDir, 'metadata.json'), 
      JSON.stringify(metadata, null, 2)
    );

    // Copy CSV to public folder for frontend access
    await fs.copyFile(
      req.file.path,
      path.join(__dirname, 'public', 'videa_s_extrahovanymi_info.csv')
    );

    res.json({ 
      message: 'CSV file uploaded successfully',
      datasetId: datasetId,
      filename: req.file.originalname
    });

  } catch (error) {
    console.error('Error uploading CSV:', error);
    res.status(500).json({ error: 'Failed to upload CSV file' });
  }
});

// API endpoint pro získání seznamu datasetů
app.get('/api/datasets', async (req, res) => {
  try {
    const datasetsDir = path.join(__dirname, 'datasets');
    const datasets = [];
    
    const entries = await fs.readdir(datasetsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const datasetPath = path.join(datasetsDir, entry.name);
        const metadataPath = path.join(datasetPath, 'metadata.json');
        const extractedPath = path.join(datasetPath, 'extracted.csv');
        
        let metadata = {};
        let hasExtracted = false;
        
        try {
          if (await fs.access(metadataPath).then(() => true).catch(() => false)) {
            const metadataContent = await fs.readFile(metadataPath, 'utf8');
            metadata = JSON.parse(metadataContent);
          }
          
          hasExtracted = await fs.access(extractedPath).then(() => true).catch(() => false);
        } catch (error) {
          console.error(`Error reading dataset ${entry.name}:`, error);
        }
        
        datasets.push({
          id: entry.name,
          name: metadata.name || entry.name,
          createdAt: metadata.createdAt || entry.name.split('T')[0],
          hasExtracted,
          videoCount: metadata.videoCount || 0
        });
      }
    }
    
    // Seřadíme podle data vytvoření (nejnovější první)
    datasets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json(datasets);
  } catch (error) {
    console.error('Error listing datasets:', error);
    res.status(500).json({ error: 'Failed to list datasets' });
  }
});

// API endpoint pro smazání datasetu
app.delete('/api/datasets/:datasetId', async (req, res) => {
  try {
    const { datasetId } = req.params;
    const datasetPath = path.join(__dirname, 'datasets', datasetId);
    
    // Ověříme, že cesta existuje a je v datasets složce
    if (!datasetPath.startsWith(path.join(__dirname, 'datasets'))) {
      return res.status(400).json({ error: 'Invalid dataset ID' });
    }
    
    // Zkontrolujeme, jestli složka existuje
    try {
      await fs.access(datasetPath);
    } catch (error) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    // Smažeme celou složku
    await fs.rm(datasetPath, { recursive: true, force: true });
    
    res.json({ message: 'Dataset deleted successfully' });
  } catch (error) {
    console.error('Error deleting dataset:', error);
    res.status(500).json({ error: 'Failed to delete dataset' });
  }
});

// API endpoint pro získání nejnovějšího extracted.csv
app.get('/api/latest-extracted', async (req, res) => {
  try {
    const datasetsDir = path.join(__dirname, 'datasets');
    const entries = await fs.readdir(datasetsDir, { withFileTypes: true });
    
    // Najdeme nejnovější dataset s extracted.csv
    let latestDataset = null;
    let latestTime = 0;
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const extractedPath = path.join(datasetsDir, entry.name, 'extracted.csv');
        try {
          const stats = await fs.stat(extractedPath);
          if (stats.mtime.getTime() > latestTime) {
            latestTime = stats.mtime.getTime();
            latestDataset = entry.name;
          }
        } catch (error) {
          // Soubor neexistuje, pokračujeme
        }
      }
    }
    
    if (!latestDataset) {
      return res.status(404).json({ error: 'No extracted data found' });
    }
    
    const extractedPath = path.join(datasetsDir, latestDataset, 'extracted.csv');
    const csvContent = await fs.readFile(extractedPath, 'utf8');
    
    // Parsujeme CSV
    const lines = csvContent.split('\n');
    const headers = lines[0].split(';');
    const videos = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(';');
        const video = {};
        headers.forEach((header, index) => {
          video[header.trim()] = values[index] ? values[index].trim() : '';
        });
        videos.push(video);
      }
    }
    
    res.json(videos);
  } catch (error) {
    console.error('Error loading latest extracted data:', error);
    res.status(500).json({ error: 'Failed to load extracted data' });
  }
});

// API endpoint pro aktualizaci zdroje videa
app.post('/api/update-source', async (req, res) => {
  try {
    const { videoTitle, newSource } = req.body;
    
    if (!videoTitle || !newSource) {
      return res.status(400).json({ error: 'Video title and new source are required' });
    }
    
    const datasetsDir = path.join(__dirname, 'datasets');
    const entries = await fs.readdir(datasetsDir, { withFileTypes: true });
    
    // Najdeme nejnovější dataset s extracted.csv
    let latestDataset = null;
    let latestTime = 0;
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const extractedPath = path.join(datasetsDir, entry.name, 'extracted.csv');
        try {
          const stats = await fs.stat(extractedPath);
          if (stats.mtime.getTime() > latestTime) {
            latestTime = stats.mtime.getTime();
            latestDataset = entry.name;
          }
        } catch (error) {
          // Soubor neexistuje, pokračujeme
        }
      }
    }
    
    if (!latestDataset) {
      return res.status(404).json({ error: 'No extracted data found' });
    }
    
    const extractedPath = path.join(datasetsDir, latestDataset, 'extracted.csv');
    const csvContent = await fs.readFile(extractedPath, 'utf8');
    
    // Parsujeme CSV a aktualizujeme zdroj
    const lines = csvContent.split('\n');
    const headers = lines[0].split(';');
    const sourceIndex = headers.findIndex(h => h.trim() === 'Extrahované info');
    
    if (sourceIndex === -1) {
      return res.status(400).json({ error: 'Source column not found' });
    }
    
    let updated = false;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(';');
        const title = values[0] ? values[0].trim() : '';
        
        if (title === videoTitle) {
          values[sourceIndex] = newSource;
          lines[i] = values.join(';');
          updated = true;
          break;
        }
      }
    }
    
    if (!updated) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Uložíme aktualizovaný CSV
    const updatedCsv = lines.join('\n');
    await fs.writeFile(extractedPath, updatedCsv, 'utf8');
    
    res.json({ message: 'Source updated successfully' });
  } catch (error) {
    console.error('Error updating source:', error);
    res.status(500).json({ error: 'Failed to update source' });
  }
});

// Serve the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});