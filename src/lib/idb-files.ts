/**
 * IndexedDB utility stubs for storing raw files between pages.
 * 
 * TODO: Re-implement with new backend storage when building out the SRS/SDD.
 * These are no-op stubs to allow the UI skeleton to compile without errors.
 */

export interface StoredFile {
    name: string;
    type: string;
    blob: Blob;
}

/** Save an array of files under a session key. (STUB — no-op) */
export async function saveFilesToIDB(
    _sessionId: string,
    _files: { slotIndex: number; file: File }[],
): Promise<void> {
    console.log("[stub] saveFilesToIDB called — implement with new backend");
}

/** Retrieve stored files for a session. (STUB — returns empty) */
export async function getFilesFromIDB(
    _sessionId: string,
): Promise<Record<number, StoredFile>> {
    console.log("[stub] getFilesFromIDB called — implement with new backend");
    return {};
}

/** Delete stored files for a session. (STUB — no-op) */
export async function deleteFilesFromIDB(_sessionId: string): Promise<void> {
    console.log("[stub] deleteFilesFromIDB called — implement with new backend");
}

/** Clear ALL stored files. (STUB — no-op) */
export async function clearAllFilesFromIDB(): Promise<void> {
    console.log("[stub] clearAllFilesFromIDB called — implement with new backend");
}
