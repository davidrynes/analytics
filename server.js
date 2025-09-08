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
function runPythonScript(scriptPath, args = [], timeoutMs = 20 * 60 * 1000) { // 20 minutes timeout (reduced)
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [scriptPath, ...args], {
      cwd: path.join(__dirname, './'),
      stdio: ['pipe', 'pipe', 'pipe'], // Explicit stdio configuration
      detached: false // Ensure process is not detached
    });

    let stdout = '';
    let stderr = '';
    let isResolved = false;

    // Set up timeout
    const timeout = setTimeout(() => {
      if (!isResolved) {
        console.log(`⏰ Python script ${scriptPath} timed out after ${timeoutMs/1000} seconds`);
        isResolved = true;
        
        // Kill the process tree
        try {
          process.kill(-pythonProcess.pid, 'SIGTERM');
        } catch (e) {
          console.error('Error killing process:', e);
          try {
            pythonProcess.kill('SIGKILL');
          } catch (e2) {
            console.error('Error force killing process:', e2);
          }
        }
        
        reject(new Error(`Python script ${scriptPath} timed out after ${timeoutMs/1000} seconds`));
      }
    }, timeoutMs);

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(data.toString());
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(data.toString());
    });

    pythonProcess.on('close', (code) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        
        console.log(`🏁 Python script ${scriptPath} finished with code ${code}`);
        
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        }
      }
    });

    pythonProcess.on('error', (error) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        console.error(`❌ Python script ${scriptPath} error:`, error);
        reject(error);
      }
    });

    // Handle process cleanup on exit
    pythonProcess.on('exit', (code, signal) => {
      if (!isResolved) {
        console.log(`🚪 Python script ${scriptPath} exited with code ${code}, signal ${signal}`);
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
      // No need to modify script - we pass paths as arguments now
      
        // Use batch processing with automatic continuation until all videos are processed
        const batchSize = 15; // Very small batch size for Railway
        const maxVideosPerRun = 50; // Process max 50 videos per run to avoid timeout
        const maxRuns = 10; // Safety limit - max 10 runs (500 videos total)
        
        let currentRun = 0;
        let allVideosProcessed = false;
        
        while (!allVideosProcessed && currentRun < maxRuns) {
          currentRun++;
          console.log(`🔄 Starting extraction run ${currentRun}/${maxRuns}`);
          
          const result2 = await runPythonScript('extract_video_info_fast.py', [
            path.join(datasetDir, 'clean.csv'),
            path.join(datasetDir, 'extracted.csv'),
            maxVideosPerRun.toString(),
            batchSize.toString()
          ]);
          
          console.log(`✅ Extraction run ${currentRun} completed:`, result2.stdout);
          
          // Check if all videos are processed
          try {
            const cleanCsv = await fs.readFile(path.join(datasetDir, 'clean.csv'), 'utf-8');
            const cleanLines = cleanCsv.split('\n').filter(line => line.trim());
            const totalVideos = cleanLines.length - 1;
            
            let processedVideos = 0;
            try {
              const extractedCsv = await fs.readFile(path.join(datasetDir, 'extracted.csv'), 'utf-8');
              const extractedLines = extractedCsv.split('\n').filter(line => line.trim());
              processedVideos = extractedLines.length - 1;
            } catch (e) {
              processedVideos = 0;
            }
            
            console.log(`📊 Progress: ${processedVideos}/${totalVideos} videos processed`);
            
            // Update progress bar in real-time
            try {
              const progressPath = path.join(__dirname, 'progress.json');
              await fs.writeFile(progressPath, JSON.stringify({
                current: processedVideos,
                total: totalVideos,
                status: 'processing',
                message: `Automatické zpracování: ${processedVideos}/${totalVideos} videí (run ${currentRun})`
              }));
            } catch (e) {}
            
            if (processedVideos >= totalVideos) {
              allVideosProcessed = true;
              console.log('🎉 All videos processed successfully!');
            } else if (processedVideos === 0) {
              console.log('⚠️ No new videos processed, stopping to avoid infinite loop');
              break;
            } else {
              console.log(`⏳ Continuing with next batch after 3 seconds...`);
              await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
            }
            
          } catch (e) {
            console.log('Could not check progress, stopping');
            break;
          }
        }
        
        if (currentRun >= maxRuns) {
          console.log(`⚠️ Reached maximum runs limit (${maxRuns}). Some videos may remain unprocessed.`);
        }
        
        console.log(`🏁 Extraction process completed after ${currentRun} runs`);
      
      // Get final video counts from the last iteration of while loop
      let totalVideos = 0;
      let processedVideos = 0;
      
      try {
        const cleanCsv = await fs.readFile(path.join(datasetDir, 'clean.csv'), 'utf-8');
        const cleanLines = cleanCsv.split('\n').filter(line => line.trim());
        totalVideos = cleanLines.length - 1;
        
        try {
          const extractedCsv = await fs.readFile(path.join(datasetDir, 'extracted.csv'), 'utf-8');
          const extractedLines = extractedCsv.split('\n').filter(line => line.trim());
          processedVideos = extractedLines.length - 1;
        } catch (e) {
          processedVideos = 0;
        }
      } catch (e) {
        console.log('Could not count videos');
      }
      
      // Update metadata with final status (while loop determined if all videos processed)
      metadata.status = allVideosProcessed ? 'completed' : 'error';
      metadata.steps.extraction_completed = allVideosProcessed;
      metadata.videos_total = totalVideos;
      metadata.videos_processed = processedVideos;
      metadata.completedTime = new Date().toISOString();
      
      console.log(`📊 Final status: ${metadata.status} - ${processedVideos}/${totalVideos} videos processed`);
      await fs.writeFile(path.join(datasetDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      
      // Clear progress status - extraction is done
      const progressPath = path.join(__dirname, 'progress.json');
      try {
        await fs.writeFile(progressPath, JSON.stringify({
          status: allVideosProcessed ? 'completed' : 'error',
          message: allVideosProcessed ? 'Extrakce dokončena úspěšně' : `Chyba při extrakci: ${processedVideos}/${totalVideos} videí zpracováno`,
          current: processedVideos,
          total: totalVideos,
          timestamp: new Date().toISOString()
        }));
        console.log(`✅ Progress status updated to ${allVideosProcessed ? 'completed' : 'error'}`);
      } catch (progressError) {
        console.error('Error updating progress status:', progressError);
      }
      
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
      
      // Clear progress status - extraction failed
      const progressPath = path.join(__dirname, 'progress.json');
      try {
        await fs.writeFile(progressPath, JSON.stringify({
          status: 'error',
          message: `Extrakce selhala: ${extractError.message}`,
          progress: 0,
          timestamp: new Date().toISOString()
        }));
        console.log('❌ Progress status updated to error');
      } catch (progressError) {
        console.error('Error updating progress status:', progressError);
      }
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
    
    try {
      const entries = await fs.readdir(datasetsDir, { withFileTypes: true });
      const datasets = [];
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const datasetPath = path.join(datasetsDir, entry.name);
          const metadataPath = path.join(datasetPath, 'metadata.json');
          const extractedPath = path.join(datasetPath, 'extracted.csv');
          
          let metadata = {};
          let hasExtracted = false;
          
          try {
            const metadataContent = await fs.readFile(metadataPath, 'utf8');
            metadata = JSON.parse(metadataContent);
          } catch (err) {
            console.log(`No metadata for ${entry.name}`);
          }
          
          try {
            await fs.access(extractedPath);
            hasExtracted = true;
          } catch (err) {
            // extracted.csv doesn't exist
          }
          
          datasets.push({
            id: entry.name,
            ...metadata,
            hasExtracted,
            createdAt: entry.name.split('_')[0] // Extract timestamp from folder name
          });
        }
      }
      
      // Sort by creation date (newest first)
      datasets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      res.json(datasets);
    } catch (dirError) {
      // Directory doesn't exist yet - return empty array
      console.log('Datasets directory does not exist yet, returning empty array');
      res.json([]);
    }
  } catch (error) {
    console.error('Error fetching datasets:', error);
    res.status(500).json({ error: 'Failed to fetch datasets' });
  }
});

// API endpoint pro smazání datasetu
app.delete('/api/datasets/:datasetId', async (req, res) => {
  try {
    const { datasetId } = req.params;
    const datasetPath = path.join(__dirname, 'datasets', datasetId);
    
    // Security check - ensure path is within datasets directory
    const resolvedPath = path.resolve(datasetPath);
    const datasetsDir = path.resolve(path.join(__dirname, 'datasets'));
    
    if (!resolvedPath.startsWith(datasetsDir)) {
      return res.status(400).json({ error: 'Invalid dataset path' });
    }
    
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
    
    try {
      const entries = await fs.readdir(datasetsDir, { withFileTypes: true });
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
          } catch (err) {
            // extracted.csv doesn't exist
          }
        }
      }
      
      if (!latestDataset) {
        return res.status(404).json({ error: 'No extracted.csv found' });
      }
      
      const extractedPath = path.join(datasetsDir, latestDataset, 'extracted.csv');
      const csvContent = await fs.readFile(extractedPath, 'utf8');
      
      // Parse CSV content
      const lines = csvContent.split('\n');
      const headers = lines[0].split(';');
      const data = [];
      
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(';');
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          data.push(row);
        }
      }
      
      res.json({
        datasetId: latestDataset,
        data: data,
        headers: headers
      });
    } catch (dirError) {
      // Directory doesn't exist - check fallback CSV
      console.log('Datasets directory does not exist, checking fallback CSV');
      const fallbackPath = path.join(__dirname, 'public', 'videa_s_extrahovanymi_info.csv');
      
      try {
        const csvContent = await fs.readFile(fallbackPath, 'utf8');
        const lines = csvContent.split('\n');
        const headers = lines[0].split(';');
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim()) {
            const values = lines[i].split(';');
            const row = {};
            headers.forEach((header, index) => {
              row[header] = values[index] || '';
            });
            data.push(row);
          }
        }
        
        res.json({
          datasetId: 'fallback',
          data: data,
          headers: headers
        });
      } catch (fallbackError) {
        return res.status(404).json({ error: 'No extracted data found' });
      }
    }
  } catch (error) {
    console.error('Error fetching latest extracted data:', error);
    res.status(500).json({ error: 'Failed to fetch latest extracted data' });
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
        } catch (err) {
          // extracted.csv doesn't exist
        }
      }
    }
    
    if (!latestDataset) {
      return res.status(404).json({ error: 'No extracted.csv found' });
    }
    
    const extractedPath = path.join(datasetsDir, latestDataset, 'extracted.csv');
    const csvContent = await fs.readFile(extractedPath, 'utf8');
    
    // Parse CSV content
    const lines = csvContent.split('\n');
    const headers = lines[0].split(';');
    let updated = false;
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(';');
        const titleIndex = headers.findIndex(h => h.includes('Název') || h.includes('Title'));
        
        if (titleIndex !== -1 && values[titleIndex] && values[titleIndex].includes(videoTitle)) {
          const sourceIndex = headers.findIndex(h => h.includes('Extrahované') || h.includes('Source'));
          if (sourceIndex !== -1) {
            values[sourceIndex] = newSource;
            lines[i] = values.join(';');
            updated = true;
            break;
          }
        }
      }
    }
    
    if (!updated) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Write updated CSV
    const updatedContent = lines.join('\n');
    await fs.writeFile(extractedPath, updatedContent, 'utf8');
    
    res.json({ message: 'Source updated successfully' });
  } catch (error) {
    console.error('Error updating source:', error);
    res.status(500).json({ error: 'Failed to update source' });
  }
});

// API endpoint pro update datasetu
// Restart extraction endpoint (for error recovery)
app.post('/api/datasets/:datasetId/restart-extraction', async (req, res) => {
  const { datasetId } = req.params;
  const datasetDir = path.join(__dirname, 'datasets', datasetId);
  
  try {
    // Check if dataset exists
    try {
      await fs.access(datasetDir);
    } catch (e) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    // Check if clean.csv exists
    const cleanCsvPath = path.join(datasetDir, 'clean.csv');
    try {
      await fs.access(cleanCsvPath);
    } catch (e) {
      return res.status(400).json({ error: 'Clean CSV not found. Process Excel file first.' });
    }
    
    console.log(`Starting restart extraction for dataset ${datasetId}`);
    
    // Delete existing extracted.csv to start fresh
    const extractedPath = path.join(datasetDir, 'extracted.csv');
    try {
      await fs.unlink(extractedPath);
      console.log('🗑️ Deleted existing extracted.csv for fresh restart');
    } catch (e) {
      console.log('No existing extracted.csv to delete');
    }
    
    // Start automatic batch processing (same as initial extraction)
    const batchSize = 15;
    const maxVideosPerRun = 50;
    const maxRuns = 10;
    
    let currentRun = 0;
    let allVideosProcessed = false;
    
    while (!allVideosProcessed && currentRun < maxRuns) {
      currentRun++;
          console.log(`🔄 Restart extraction run ${currentRun}/${maxRuns}`);
          
          const result = await runPythonScript('extract_video_info_fast.py', [
            path.join(datasetDir, 'clean.csv'),
            path.join(datasetDir, 'extracted.csv'),
            maxVideosPerRun.toString(),
            batchSize.toString()
          ]);
          
          console.log(`✅ Restart run ${currentRun} completed:`, result.stdout);
      
      // Check if all videos are processed
      try {
        const cleanCsv = await fs.readFile(cleanCsvPath, 'utf-8');
        const cleanLines = cleanCsv.split('\n').filter(line => line.trim());
        const totalVideos = cleanLines.length - 1;
        
        let processedVideos = 0;
        try {
          const extractedCsv = await fs.readFile(path.join(datasetDir, 'extracted.csv'), 'utf-8');
          const extractedLines = extractedCsv.split('\n').filter(line => line.trim());
          processedVideos = extractedLines.length - 1;
        } catch (e) {
          processedVideos = 0;
        }
        
        console.log(`📊 Continue progress: ${processedVideos}/${totalVideos} videos processed`);
        
        // Update progress bar in real-time
        try {
          const progressPath = path.join(__dirname, 'progress.json');
          await fs.writeFile(progressPath, JSON.stringify({
            current: processedVideos,
            total: totalVideos,
            status: 'processing',
            message: `Restart extrakce: ${processedVideos}/${totalVideos} videí (run ${currentRun})`
          }));
        } catch (e) {}
        
        if (processedVideos >= totalVideos) {
          allVideosProcessed = true;
          console.log('🎉 All videos processed successfully!');
        } else if (processedVideos === 0) {
          console.log('⚠️ No new videos processed, stopping to avoid infinite loop');
          break;
        } else {
          console.log(`⏳ Continuing with next batch after 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } catch (e) {
        console.log('Could not check progress, stopping');
        break;
      }
    }
    
    if (currentRun >= maxRuns) {
      console.log(`⚠️ Reached maximum runs limit (${maxRuns}). Some videos may remain unprocessed.`);
    }
    
    console.log(`🏁 Restart extraction completed after ${currentRun} runs`);
    
    // Update metadata with final counts
    const metadataPath = path.join(datasetDir, 'metadata.json');
    let metadata = {};
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      metadata = JSON.parse(metadataContent);
    } catch (e) {
      console.log('Could not load metadata, creating new');
    }
    
    // Get final status
    let totalVideos = 0;
    let processedVideos = 0;
    
    try {
      const cleanCsv = await fs.readFile(cleanCsvPath, 'utf-8');
      const cleanLines = cleanCsv.split('\n').filter(line => line.trim());
      totalVideos = cleanLines.length - 1;
      
      try {
        const extractedCsv = await fs.readFile(path.join(datasetDir, 'extracted.csv'), 'utf-8');
        const extractedLines = extractedCsv.split('\n').filter(line => line.trim());
        processedVideos = extractedLines.length - 1;
      } catch (e) {
        processedVideos = 0;
      }
    } catch (e) {
      console.log('Could not count videos');
    }
    
    // Update metadata
    metadata.status = processedVideos >= totalVideos ? 'completed' : 'partial';
    metadata.steps = metadata.steps || {};
    metadata.steps.extraction_completed = processedVideos >= totalVideos;
    metadata.videos_total = totalVideos;
    metadata.videos_processed = processedVideos;
    metadata.lastContinueTime = new Date().toISOString();
    
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    // Clear progress status
    const progressPath = path.join(__dirname, 'progress.json');
    try {
      await fs.writeFile(progressPath, JSON.stringify({
        current: processedVideos,
        total: totalVideos,
        status: processedVideos >= totalVideos ? 'completed' : 'partial',
        message: `Zpracováno ${processedVideos} z ${totalVideos} videí`
      }));
    } catch (e) {
      console.log('Could not update progress');
    }
    
        res.json({ 
          success: true, 
          message: `Extraction restarted and completed. Processed ${processedVideos}/${totalVideos} videos.`,
          videos_processed: processedVideos,
          videos_total: totalVideos,
          status: allVideosProcessed ? 'completed' : 'error'
        });
    
  } catch (error) {
    console.error('Restart extraction failed:', error);
    
    // Update progress to error
    try {
      const progressPath = path.join(__dirname, 'progress.json');
      await fs.writeFile(progressPath, JSON.stringify({
        current: 0,
        total: 0,
        status: 'error',
        message: 'Chyba při pokračování extrakce'
      }));
    } catch (e) {}
    
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/datasets/:datasetId/update', express.text({ type: 'text/plain', limit: '50mb' }), async (req, res) => {
  try {
    const { datasetId } = req.params;
    const csvContent = req.body;
    
    console.log(`📝 Update request for dataset: ${datasetId}`);
    console.log(`📄 Content type: ${typeof csvContent}`);
    console.log(`📏 Content length: ${csvContent ? csvContent.length : 'null'}`);
    
    if (!csvContent || typeof csvContent !== 'string') {
      console.error(`❌ Invalid CSV content: type=${typeof csvContent}, length=${csvContent ? csvContent.length : 'null'}`);
      return res.status(400).json({ error: 'Invalid CSV content' });
    }
    
    const datasetsDir = path.join(__dirname, 'datasets');
    const datasetDir = path.join(datasetsDir, datasetId);
    const extractedPath = path.join(datasetDir, 'extracted.csv');
    
    // Check if dataset exists
    try {
      await fs.access(datasetDir);
    } catch (error) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    // Save updated CSV
    await fs.writeFile(extractedPath, csvContent, 'utf8');
    
    // Update metadata
    const metadataPath = path.join(datasetDir, 'metadata.json');
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      metadata.lastModified = new Date().toISOString();
      metadata.modifiedBy = 'dataset-editor';
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (metaError) {
      console.log('Could not update metadata:', metaError);
    }
    
    // Copy to public folder if this is the active dataset
    const publicPath = path.join(__dirname, 'public', 'videa_s_extrahovanymi_info.csv');
    try {
      // Check if this is the currently active dataset by comparing modification times
      const publicStats = await fs.stat(publicPath);
      const datasetStats = await fs.stat(extractedPath);
      
      // If the dataset was just modified, it's likely the active one
      if (Math.abs(datasetStats.mtime.getTime() - Date.now()) < 5000) {
        await fs.copyFile(extractedPath, publicPath);
        console.log('Updated dataset copied to public folder');
      }
    } catch (copyError) {
      console.log('Could not copy to public folder:', copyError);
    }
    
    res.json({ 
      message: 'Dataset updated successfully',
      datasetId: datasetId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error updating dataset:', error);
    res.status(500).json({ 
      error: 'Failed to update dataset', 
      details: error.message,
      datasetId: req.params.datasetId
    });
  }
});

// Serve the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'build')));
  
  // Catch-all handler: send back React's index.html file for any non-API routes
  app.get('*', (req, res) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Railway Environment: ${process.env.RAILWAY_ENVIRONMENT || 'not set'}`);
  console.log(`Port: ${port}`);
});