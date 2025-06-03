import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useParams } from 'react-router-dom';

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

const ContentDetailPage: React.FC = () => {
  const { id } = useParams();
  const [content, setContent] = useState<Content | null>(null);

  useEffect(() => {
    const fetchContent = async () => {
      if (!id) return;
      const docRef = doc(db, 'contents', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setContent({ id: snap.id, ...snap.data() } as Content);
      }
    };
    fetchContent();
  }, [id]);

  if (!content) return <div>Loading...</div>;

  return (
    <div style={{ maxWidth: 800, margin: 'auto', padding: 40 }}>
      <h2>{content.title}</h2>
      <p>{content.body}</p>
      {content.type === 'image' && content.mediaUrl && (
        <img src={content.mediaUrl} alt="media" style={{ maxWidth: '100%' }} />
      )}
      {content.type === 'video' && content.mediaUrl && (
        <video src={content.mediaUrl} controls style={{ maxWidth: '100%' }} />
      )}
      {content.type === 'music' && content.mediaUrl && (
        <audio src={content.mediaUrl} controls />
      )}
      {content.type === 'link' && content.mediaUrl && (
        <a href={content.mediaUrl} target="_blank" rel="noopener noreferrer">{content.mediaUrl}</a>
      )}
      <hr />
      {/* 투자/배당/지분 등은 이후 확장 구현 */}
      <div>
        <h3>투자 기능 (추후 구현)</h3>
        <p>여기에 투자 폼 및 투자 내역 표시 예정</p>
      </div>
    </div>
  );
};

export default ContentDetailPage;
