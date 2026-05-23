import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const NOTES_FILE = path.join(process.cwd(), 'data', 'notes.json');

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

function readNotes(): Note[] {
  try {
    if (!fs.existsSync(NOTES_FILE)) return [];
    return JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeNotes(notes: Note[]) {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { title, content } = await req.json();
  const notes = readNotes();
  const index = notes.findIndex(n => n.id === id);
  if (index === -1) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }
  if (title !== undefined) notes[index].title = title.trim();
  if (content !== undefined) notes[index].content = content.trim();
  notes[index].updatedAt = Date.now();
  writeNotes(notes);
  return NextResponse.json(notes[index]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notes = readNotes();
  const filtered = notes.filter(n => n.id !== id);
  if (filtered.length === notes.length) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }
  writeNotes(filtered);
  return NextResponse.json({ success: true });
}
