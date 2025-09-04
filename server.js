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
    const pythonProcess = spawn('python3', [scriptPath, ...args], {
      cwd: path.join(__dirname, './')
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
    const parentDir = path.join(__dirname, './');
    const datasetsDir = path.join(__dirname, 'datasets');
    const datasetDir = path.join(datasetsDir, datasetId);
    
    console.log(`Processing file: ${filename} -> Dataset ID: ${datasetId}`);

    // Create dataset directory
    await fs.mkdir(datasetsDir, { recursive: true });
    await fs.mkdir(datasetDir, { recursive: true });

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
    const result1 = await runPythonScript('process_excel.py');
    
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
    const parentDir = path.join(__dirname, './');
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
    const parentDir = path.join(__dirname, './');
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