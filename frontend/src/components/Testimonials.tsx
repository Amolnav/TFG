import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useReveal } from '../services/useReveal';
import { getReviews } from '../services/api';

interface Testimonial {
  id: string;
  name: string;
  quote: string;
  rating: number;
  profile_photo_url?: string;
  relative_time_description?: string;
}

const Testimonials: React.FC = () => {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Testimonial[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const revealRef = useReveal();

  useEffect(() => {
    async function loadReviews() {
      try {
        const data = await getReviews();
        setReviews(data);
      } catch (error) {
        console.error('Error cargando reseñas:', error);
      } finally {
        setLoading(false);
      }
    }
    loadReviews();
  }, []);

  const nextSlide = useCallback(() => {
    if (reviews.length === 0) return;
    setCurrentIndex((prev: number) => (prev + 1) % reviews.length);
  }, [reviews.length]);

  const prevSlide = () => {
    if (reviews.length === 0) return;
    setCurrentIndex((prev: number) => (prev - 1 + reviews.length) % reviews.length);
  };

  useEffect(() => {
    if (isPaused || isDragging) return;
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [nextSlide, isPaused, isDragging]);

  // Drag Handlers
  const handleDragStart = (x: number) => {
    setIsDragging(true);
    setStartX(x);
    setDragOffset(0);
  };

  const handleDragMove = (x: number) => {
    if (!isDragging) return;
    const diff = x - startX;
    setDragOffset(diff);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const threshold = 50;
    if (dragOffset < -threshold) {
      nextSlide();
    } else if (dragOffset > threshold) {
      prevSlide();
    }
    setDragOffset(0);
  };

  // Mouse Events
  const onMouseDown = (e: React.MouseEvent) => handleDragStart(e.pageX);
  const onMouseMove = (e: React.MouseEvent) => handleDragMove(e.pageX);
  const onMouseUp = () => handleDragEnd();

  // Touch Events
  const onTouchStart = (e: React.TouchEvent) => handleDragStart(e.touches[0].pageX);
  const onTouchMove = (e: React.TouchEvent) => handleDragMove(e.touches[0].pageX);
  const onTouchEnd = () => handleDragEnd();

  const getTranslateX = () => {
    const baseTranslate = -(currentIndex * 100);
    if (!containerRef.current || !isDragging) return `${baseTranslate}%`;
    
    const containerWidth = containerRef.current.offsetWidth;
    const offsetPercent = (dragOffset / containerWidth) * 100;
    return `calc(${baseTranslate}% + ${offsetPercent}%)`;
  };

  return (
    <section className="testimonials" ref={revealRef}>
      <div className="section-header reveal">
        <div className="google-badge">
          <svg viewBox="0 0 24 24" width="24" height="24" className="google-icon">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span className="google-text">{t('testimonials.googleReviews')}</span>
        </div>
        <h2>{t('testimonials.title')}</h2>
      </div>
      
      <div 
        className={`carousel-container ${isDragging ? 'dragging' : ''}`}
        ref={containerRef}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => {
          setIsPaused(false);
          if (isDragging) handleDragEnd();
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div 
          className="carousel-track" 
          style={{ 
            transform: `translateX(${getTranslateX()})`,
            transition: isDragging ? 'none' : 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          {loading ? (
            <div className="carousel-slide">
              <div className="testimonial-card">
                <p className="quote">{t('testimonials.loading')}</p>
              </div>
            </div>
          ) : reviews.length === 0 ? (
            <div className="carousel-slide">
              <div className="testimonial-card">
                <p className="quote">{t('testimonials.empty')}</p>
              </div>
            </div>
          ) : (
            reviews.map((item) => (
              <div key={item.id} className="carousel-slide">
                <div className="testimonial-card google-style">
                  <div className="testimonial-header">
                    <div className="author-info">
                      {item.profile_photo_url ? (
                        <img src={item.profile_photo_url} alt={item.name} className="author-avatar" />
                      ) : (
                        <div className="author-avatar placeholder">{item.name[0]}</div>
                      )}
                      <div>
                        <p className="customer-name">{item.name}</p>
                        <p className="review-date">{item.relative_time_description}</p>
                      </div>
                    </div>
                    <div className="google-icon-small">
                      <svg viewBox="0 0 24 24" width="18" height="18">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                    </div>
                  </div>
                  <div className="rating">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className={i < item.rating ? 'star filled' : 'star'}>★</span>
                    ))}
                  </div>
                  <p className="quote">{item.quote}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <button className="carousel-nav prev" onClick={(e) => { e.stopPropagation(); prevSlide(); }} aria-label={t('testimonials.prev')}>‹</button>
        <button className="carousel-nav next" onClick={(e) => { e.stopPropagation(); nextSlide(); }} aria-label={t('testimonials.next')}>›</button>

        <div className="carousel-dots">
          {reviews.map((_, index) => (
            <button
              key={index}
              className={`dot ${index === currentIndex ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(index); }}
              aria-label={t('testimonials.goToReview', { number: index + 1 })}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
