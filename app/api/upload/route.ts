import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin from 'firebase-admin';

export const dynamic = 'force-dynamic';

const initFirebase = () => {
  if (!admin.apps.length) {
    try {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

      // Super Robust Cleaning: regex to find the PEM content
      const match = privateKey.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/);
      if (match) {
        privateKey = match[0].replace(/\\n/g, '\n');
      } else {
        privateKey = privateKey.replace(/\\n/g, '\n').replace(/"/g, '').trim();
      }

      if (!privateKey) {
        console.error('Firebase Private Key is missing or invalid');
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
  return admin.apps.length ? admin.storage().bucket() : null;
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  if (!cookieStore.get('admin_session')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const bucket = initFirebase();
    if (!bucket) {
      return NextResponse.json({ error: 'Storage not initialized' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only images allowed' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `melodify/${Date.now()}-${file.name}`;
    const fileUpload = bucket.file(filename);

    await fileUpload.save(buffer, {
      metadata: { contentType: file.type },
    });

    await fileUpload.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
