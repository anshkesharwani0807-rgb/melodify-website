import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin from 'firebase-admin';

export const dynamic = 'force-dynamic';

const initFirebase = () => {
  // Check if we are in a build environment without the necessary keys
  if (!process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_PROJECT_ID) {
    console.log('Firebase keys missing, skipping init (possibly build time)');
    return null;
  }

  if (!admin.apps.length) {
    try {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;

      // Clean the private key thoroughly
      // 1. Convert literal \n to real newlines
      privateKey = privateKey.replace(/\\n/g, '\n');

      // 2. Remove any wrapping quotes
      privateKey = privateKey.replace(/^"(.*)"$/, '$1');

      // 3. Trim each line and remove extra spaces that Vercel might add
      privateKey = privateKey.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');

      if (!privateKey.includes('BEGIN PRIVATE KEY')) {
        console.error('Invalid Private Key format');
        return null;
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    } catch (error) {
      console.error('Firebase Init Error:', error);
      return null;
    }
  }
  return admin.storage().bucket();
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  if (!cookieStore.get('admin_session')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const bucket = initFirebase();
    if (!bucket) {
      return NextResponse.json({ error: 'Storage initialization failed. Check server logs.' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only images allowed' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `melodify/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    const fileUpload = bucket.file(filename);

    await fileUpload.save(buffer, {
      metadata: { contentType: file.type },
    });

    await fileUpload.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
