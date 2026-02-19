import * as fs from 'fs';
import * as path from 'path';

export class FileScanner {
    static readFile(filePath: string): string {
        try {
            const absolutePath = path.resolve(filePath);
            if (!fs.existsSync(absolutePath)) {
                throw new Error(`File not found: ${absolutePath}`);
            }
            return fs.readFileSync(absolutePath, 'utf-8');
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Error reading file: ${error.message}`);
            } else {
                throw new Error('Unknown error reading file');
            }
        }
    }
}
