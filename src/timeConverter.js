export function convertToSeconds(timeString) {
    const regex = /(?:(\d+)\s*godz.\s*)?(?:(\d+)\s*min\s*)?(\d+)\s*s/;
    const match = timeString.match(regex);

    if (!match) return null; // Return null if format is incorrect

    const hours = match[1] ? parseInt(match[1], 10) : 0; // Default to 0 if hours don't exist
    const minutes = match[2] ? parseInt(match[2], 10) : 0; // Default to 0 if minutes don't exist
    const seconds = parseInt(match[3], 10);

    return hours * 3600 + minutes * 60 + seconds;
}