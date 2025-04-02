import React, { useState, useEffect } from "react";
import { convertToSeconds } from "./timeConverter";
import * as XLSX from "xlsx";
import jschardet from "jschardet";

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
    // Read the file content
    let content = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        let result = '';
        const content = reader.result;
        let detectedEncodings = jschardet.detectAll(reader.result);
        for (let encodingObj of detectedEncodings) {
          const decoder = new TextDecoder(encodingObj?.encoding ?? 'utf-8');
          const uint8Array = new Uint8Array(content.length);
          for (let i = 0; i < content.length; i++) {
              uint8Array[i] = content.charCodeAt(i);
          }
          result = decoder.decode(uint8Array);
          if (result.includes('Imię i nazwisko')) {
            break;
          }
        }

        resolve(result);
      };

      reader.onerror = (error) => {
        console.error("Error reading file:", error);
        reject("");
      };

      reader.readAsBinaryString(file); // its deprecated but only this works
    });

    const lines = content.split('\n');  // Split the content into rows
    let foundHeader = false;  // Flag to mark when we've found the "Imię i Nazwisko" header
    for (let i = 0; i < lines.length; i++) {
      const row = lines[i].trim();  // Trim any leading or trailing spaces
      const rowData = row.split(/[\t;]/); // Split by tab(xlsx) and semicolon(csv)
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
  const [threshold, setThreshold] = useState(() => {
    return localStorage.getItem("threshold") ? Number(localStorage.getItem("threshold")) : 50;
  });
  const [fileType, setFileType] = useState(() => {
    return localStorage.getItem("fileType") || "xlsx";
  });
  const [resultData, setResultData] = useState(null);
  const [filteredResultData, setFilteredResultData] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    localStorage.setItem("threshold", threshold);
  }, [threshold]);

  useEffect(() => {
    localStorage.setItem("fileType", fileType);
  }, [fileType]);

  const handleThresholdChange = (event) => {
    const value = event.target.value;
    if (value >= 0 && value <= 100) {
      setThreshold(value);
    }
    setThreshold(value);
  };

  const handleFileTypeChange = (event) => {
    setFileType(event.target.value);
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
        setSearchQuery("");
        const files = Array.from(event.target.files);

        if (files.length === 0) {
          alert("No files selected.");
          return;
        }

        await processCsvFiles(files);
        let resultContent = classes[0]?.title + "\r\n";
        resultContent += "Imię i nazwisko\t ";
        for(const class_ of classes) {
          resultContent += class_.date + "\t "
        }
        resultContent += "ilość obecności\r\n";

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
        let blob;
        let fileExtension;
        let data = resultContent.split("\n").map(row => row.split("\t"));
        data.forEach(row => {
          const lastColumn = row.pop(); // Remove the last column
          row.splice(1, 0, lastColumn); // Insert the last column into the second position
        });

        const header = [data[0], data[1]];
        const sortedData = data.slice(2, -1).sort((a, b) => a[0].localeCompare(b[0]));
        data = [...header, ...sortedData];

        setResultData(data);
        setFilteredResultData(sortedData);
        if (fileType === "csv") {
          blob = new Blob([resultContent], { type: "text/csv" });
          fileExtension = "csv";
        }
        else if (fileType === "xlsx") {
          const ws = XLSX.utils.json_to_sheet(data, { skipHeader: true });
          Object.keys(ws).forEach((cell) => { // prevent excel from treating strings as dates
            if (!cell.startsWith("!")) {
              ws[cell].t = "s"; // Set cell type to string
            }
          });

          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Obecnosci1');
          const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
          fileExtension = "xlsx";
        }
        
        if (blob) {
          // Programmatically create a download link
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `obecności.${fileExtension}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url); // Release the object URL
        }
      };
    } catch (error) {
      console.error("Error processing files:", error);
      alert("An error occurred while processing files.");
    }
  };

  return (
    <div className="p-5 font-sans flex flex-col justify-start items-center min-h-screen overflow-y-auto">
      <h2 className="text-2xl font-bold text-center mb-6">Listy obecności z Microsoft Teams</h2>

      <div className="text-left w-full max-w-6xl mb-2">
        <p className="mb-2">1. Ustaw próg procentowego czasu udziału w zajęciach od którego uznawana jest obecność. (Uwaga: czas udziału prowadzącego zajęcia jest uznawany jako 100% czasu zajęć)</p>
        <p className="mb-2">2. Wgraj listy obecności pobrane z Teams klikając przycisk.</p>
        <p className="mb-2">3. Automatycznie zostanie wygenerowany i pobrany plik z łącznymi statystykami obecności dla każdego studenta.</p>
        
        <div className="w-full max-w-md mb-1">
          <div className="flex items-center justify-between">
            <strong>Próg: </strong>
            <input
              type="number"
              value={threshold}
              onChange={handleThresholdChange}
              min="0"
              max="100"
              className="w-16 text-center border-2 border-gray-300 rounded-lg p-1 ml-1"
            />
            <input
              type="range"
              min="0"
              max="100"
              value={threshold}
              onChange={handleThresholdChange}
              className="w-full ml-1"
            />
          </div>
        </div>

        <div className="mb-2">
          <strong>Format zwracanego pliku: </strong>
          <select value={fileType} onChange={handleFileTypeChange} className="border-2 border-gray-300 rounded-lg p-2">
            <option value="xlsx">Excel</option>
            <option value="csv">CSV</option>
            <option value="noFile">Nie pobieraj pliku</option>
          </select>
        </div>

        <button
          onClick={handleButtonClick}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none"
        >
          Wybierz pliki z obecnościami
        </button>
      </div>

      {resultData && resultData.length > 0 && (
        <>
          <h2 className="text-2xl font-bold text-center mt-8">{resultData[0]}</h2>
          <div className="w-full max-w-md mx-auto mt-2 mb-0">
            <input
              type="text"
              placeholder="Szukaj..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                const searchTerm = e.target.value.toLowerCase();
                const filteredData = resultData.slice(2).filter((row) =>
                  row.some((cell) => cell.toString().toLowerCase().includes(searchTerm))
                );
                setFilteredResultData(filteredData ?? []);
              }}
              className="w-full p-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="p-4 overflow-x-auto max-w-full mx-auto">
            <table className="w-full border border-gray-300 shadow-lg rounded-lg overflow-hidden">
              <thead className="bg-blue-500 text-white">
                <tr>
                  {resultData[1].map((header, index) => (
                    <th key={index} className="p-3 text-left border-b border-gray-300">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredResultData.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className="border-b border-gray-200 hover:bg-gray-100 transition-all"
                  >
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="p-3">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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
