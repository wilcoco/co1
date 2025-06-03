import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { Link } from 'react-router-dom';

interface Content {
  id: string;
  title: string;
  body: string;
  type: string;
  mediaUrl: string;
  createdAt: any;
  authorId: string;
  authorEmail: string;
}

const MyContentPage: React.FC = () => {
  const [contents, setContents] = useState<Content[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!auth.currentUser) return;
      const q = query(
        collection(db, 'contents'),
        where('authorId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setContents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Content)));
    };
    fetchData();
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: 'auto', padding: 40 }}>
      <h2>내 컨텐츠 목록</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {contents.map(content => (
          <li key={content.id} style={{ marginBottom: 24 }}>
            <Link to={`/content/${content.id}`}>
              <h3>{content.title}</h3>
              <p>{content.body.slice(0, 60)}...</p>
              <small>작성일: {content.createdAt?.toDate?.().toLocaleString?.()}</small>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MyContentPage;
