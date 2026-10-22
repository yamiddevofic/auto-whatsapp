import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Icon, Field } from './ui.jsx';

/**
 * Subida de imágenes con arrastrar-y-soltar. Soporta el modo de un solo archivo
 * (file / onFileChange) y el múltiple reordenable (files / onFilesChange).
 */
export default function ImageUpload({ files, onFilesChange, file, onFileChange, multiple = false }) {
  const inputRef = useRef();
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [dropActive, setDropActive] = useState(false);

  const isLegacy = !multiple && onFileChange;
  const actualFiles = isLegacy ? file : files;
  const actualOnChange = isLegacy ? onFileChange : onFilesChange;
  const fileList = multiple ? (actualFiles || []) : (actualFiles ? [actualFiles] : []);

  // Las URLs de vista previa se crean una vez por archivo y se liberan al desmontar
  const urls = useMemo(() => fileList.map((f) => URL.createObjectURL(f)), [fileList.map((f) => `${f.name}${f.size}${f.lastModified}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const accept = (list) => {
    const imgs = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    if (multiple) actualOnChange([...fileList, ...imgs]);
    else actualOnChange(imgs[0]);
  };

  const handleRemove = (index) => {
    if (multiple) actualOnChange(fileList.filter((_, i) => i !== index));
    else actualOnChange(null);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== dropIndex) {
      const reordered = [...fileList];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dropIndex, 0, moved);
      actualOnChange(reordered);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  const showDropzone = multiple || fileList.length === 0;

  return (
    <Field label={multiple ? 'Imágenes' : 'Imagen'} extra={multiple ? 'Puedes elegir varias' : 'Opcional'}>
      {showDropzone && (
        <div
          className={`dropzone ${dropActive ? 'is-over' : ''}`}
          role="button" tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={(e) => { if (dragIndex === null) { e.preventDefault(); setDropActive(true); } }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(e) => { if (dragIndex === null) { e.preventDefault(); setDropActive(false); accept(e.dataTransfer.files); } }}
        >
          <Icon name="upload" />
          <b>Arrastra {multiple ? 'tus imágenes' : 'una imagen'} aquí</b>
          <small>o haz clic para explorar</small>
        </div>
      )}
      <input
        ref={inputRef} type="file" accept="image/*" multiple={multiple} className="sr-only" tabIndex={-1}
        onChange={(e) => { accept(e.target.files); e.target.value = ''; }}
      />

      {multiple && fileList.length > 1 && (
        <span className="field-hint">Arrastra las miniaturas para cambiar el orden de publicación.</span>
      )}

      {fileList.length > 0 && (
        <div className="previews">
          {fileList.map((f, i) => (
            <div
              key={`${f.name}-${f.size}-${i}`}
              className={`preview ${dragIndex === i ? 'is-dragging' : ''} ${overIndex === i && dragIndex !== i ? 'is-over' : ''}`}
              draggable={multiple && fileList.length > 1}
              onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); setOverIndex(i); } }}
              onDrop={(e) => handleDrop(e, i)}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
            >
              {multiple && <span className="preview-order">{i + 1}</span>}
              <img src={urls[i]} alt={`Vista previa ${i + 1}`} />
              <button type="button" className="preview-remove" onClick={() => handleRemove(i)} aria-label={`Quitar imagen ${i + 1}`}>
                <Icon name="x" size="sm" />
              </button>
            </div>
          ))}
        </div>
      )}

      {multiple && fileList.length > 1 && (
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', color: 'var(--danger)' }} onClick={() => actualOnChange([])}>
          Quitar todas
        </button>
      )}
    </Field>
  );
}
