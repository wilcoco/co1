import React, { useState } from 'react';
import { db, storage, auth } from '../firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const ContentCreatePage: React.FC = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      let mediaUrl = '';
      if (file) {
        const fileRef = ref(storage, `media/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        mediaUrl = await getDownloadURL(fileRef);
      }
      await addDoc(collection(db, 'contents'), {
        title,
        body,
        type,
        mediaUrl,
        createdAt: Timestamp.now(),
        authorId: auth.currentUser?.uid,
        authorEmail: auth.currentUser?.email,
      });
      setTitle(''); setBody(''); setFile(null); setType('text');
      alert('컨텐츠가 등록되었습니다.');
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 600, margin: 'auto', padding: 40 }}>
      <h2>컨텐츠 생성</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="제목"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          style={{ width: '100%', marginBottom: 12 }}
        />
        <textarea
          placeholder="내용"
          value={body}
          onChange={e => setBody(e.target.value)}
          required
          style={{ width: '100%', marginBottom: 12, height: 80 }}
        />
        <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%', marginBottom: 12 }}>
          <option value="text">글</option>
          <option value="image">사진</option>
          <option value="video">동영상</option>
          <option value="music">음악</option>
          <option value="link">링크</option>
        </select>
        <input
          type="file"
          accept={type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : type === 'music' ? 'audio/*' : '*'}
          onChange={e => setFile(e.target.files?.[0] || null)}
          style={{ width: '100%', marginBottom: 12 }}
          disabled={type === 'text' || type === 'link'}
        />
        <button type="submit" style={{ width: '100%' }} disabled={loading}>
          {loading ? '등록 중...' : '등록하기'}
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};

export default ContentCreatePage;
