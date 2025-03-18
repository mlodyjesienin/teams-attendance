import React, { useState } from "react";
import { convertToSeconds } from "./timeConverter";
import * as XLSX from "xlsx";

let classes = []; // Class array
let students = {}; // Students dict, key is a student fullName and the value is a Student class.

class StudentAttendance {
  classId = null;
  time = 0;
  
  constructor(classId, time) {
    this.classId = classId;
    this.time = time;
  }
}

class Student {
  attendances = {}; // StudentAttendance dict, key is a classId and the value is a StudentAttendance.
  fullName = '';

  constructor(fullName) {
    this.fullName = fullName;
  }
}

class Class {
  orgaznizatorTime = 0;
  date = '';
  id = null;
  title = '';

  constructor(id) {
    this.id = id;
  }
}

const processCsvFiles = async (files) => {
  classes = [];
  students = {};
  let fileId = 0;
  for (const file of files) {
    fileId++;
    const currentClass = new Class(fileId);
    classes.push(currentClass);
    const content = await file.text();  // Read the file content
    const lines = content.split('\n');  // Split the content into rows
    let foundHeader = false;  // Flag to mark when we've found the "Imię i Nazwisko" header
    for (let i = 0; i < lines.length; i++) {
      const row = lines[i].trim();  // Trim any leading or trailing spaces
      const rowData = row.split('\t') // Split by one or more spaces
      if (row.startsWith('Godzina rozpoczęcia')) {
        currentClass.date = rowData[1];
      } 
      else if (row.startsWith('Tytuł spotkania')) {
        currentClass.title = rowData[1];
      }

      if (!foundHeader && row.includes('Imię i nazwisko')) {
        foundHeader = true;  // Mark that we've found the header
        continue;
      }
      
      if (!foundHeader){
        continue;
      }

      if (row === '') {
        // Stop when we reach an empty row (no data in the first column)
        break;
      }

      const fullName = rowData[0]; // The first column should be the name-surname
      if (rowData[6] && rowData[6].trim().toLowerCase() === 'organizator') {
        const timeInSeconds = convertToSeconds(rowData[3]);
        currentClass.orgaznizatorTime = timeInSeconds;
      }
      if (rowData[6] && rowData[6].trim().toLowerCase() !== 'organizator') {
        if (!(fullName in students)) {
          students[fullName] = new Student(fullName);
        }
        const timeInSeconds = convertToSeconds(rowData[3]);
        students[fullName].attendances[fileId] = new StudentAttendance(fileId, timeInSeconds);
      }
    }
  }
};

const FileProcessor = () => {
  const [threshold, setThreshold] = useState(50);
  const handleThresholdChange = (event) => {
    const value = event.target.value;
    if (value >= 0 && value <= 100) {
      setThreshold(value);
    }
    setThreshold(value);
  };

  const handleButtonClick = async () => {
    try {
      // Create an input element to select files or directories
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true; // Allows multiple file selection
      input.accept = ".csv"; // Accept only CSV files

      // Trigger the file selection dialog
      input.click();

      input.onchange = async (event) => {
        const files = Array.from(event.target.files);

        if (files.length === 0) {
          alert("No files selected.");
          return;
        }

        await processCsvFiles(files);
        let resultContent = classes[0]?.title + "\r\n";
        resultContent += "\t ";
        for(const class_ of classes) {
          resultContent += class_.date + "\t "
        }
        resultContent += "\r\n";

        Object.entries(students).forEach(([key, student]) => {
          resultContent += `${student.fullName}\t `;
          let classesPresentAmount = 0;
          for(const class_ of classes) {
            const studentTime = student.attendances[class_.id]?.time ?? 0;
            const percent = studentTime / class_.orgaznizatorTime * 100;
            const present = percent >= threshold;
            classesPresentAmount += present;
            resultContent += `${present ? "✔️": "✖"} ${percent.toFixed(2)}%\t `;
          }
          resultContent += classesPresentAmount + "/" + classes.length + "\r\n";
        });

        // Create a Blob for the result file
        const fileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8';
        const data = resultContent.split("\n").map(row => row.split("\t"));
        const ws = XLSX.utils.json_to_sheet(data, { skipHeader: true });
        Object.keys(ws).forEach((cell) => { // prevent excel from treating strings as dates
          if (!cell.startsWith("!")) {
            ws[cell].t = "s"; // Set cell type to string
          }
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Obecnosci1');
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: fileType });
        // const blob = new Blob([resultContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);

        // Programmatically create a download link
        const link = document.createElement("a");
        link.href = url;
        link.download = "obecności.xlsx";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Release the object URL
        URL.revokeObjectURL(url);
      };
    } catch (error) {
      console.error("Error processing files:", error);
      alert("An error occurred while processing files.");
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Listy obecności z Microsoft Teams</h1>
      <p>1. Ustaw próg procentowego czasu udziału w zajęciach od którego uznawana jest obecność.</p>
      <p>2. Wgraj listy obecności pobrane z Teams klikając przycisk.</p>
      <p>3. Automatycznie zostanie wygenerowany i pobrany plik z łącznymi statystykami obecności dla każdego studenta.</p>
      <input
        type="range"
        min="0"
        max="100"
        value={threshold}
        onChange={handleThresholdChange}
        style={{ maxWidth: "100%", width: "300px" }}
      />
      <div style={{ marginTop: "10px" }}>
        <strong>Próg:</strong>
        <input
          type="number"
          value={threshold}
          onChange={handleThresholdChange}
          min="0"
          max="100"
          style={{ width: "60px", textAlign: "center" }}
        />
      </div>
      <br></br>
      <button
        onClick={handleButtonClick}
        style={{
          padding: "10px 20px",
          backgroundColor: "#007BFF",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
        }}
      >
        Wybierz pliki z obecnościami
      </button>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <FileProcessor />
    </div>
  );
}

export default App;
