import React, { useRef, useState } from 'react';

const styles = {
  container: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 6,
    color: '#333',
  },
  input: {
    fontSize: 14,
  },
  previewGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  previewItem: {
    position: 'relative',
    cursor: 'grab',
    border: '2px solid transparent',
    borderRadius: 8,
    overflow: 'hidden',
    transition: 'border-color 0.2s',
  },
  previewItemDragging: {
    opacity: 0.4,
    border: '2px dashed #075E54',
  },
  previewItemOver: {
    border: '2px solid #075E54',
  },
  previewImage: {
    width: 120,
    height: 90,
    objectFit: 'cover',
    display: 'block',
  },
  orderBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#075E54',
    color: '#fff',
    borderRadius: '50%',
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    background: 'rgba(0,0,0,0.6)',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    borderRadius: '50%',
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
  },
  clearBtn: {
    marginTop: 8,
    background: 'none',
    border: 'none',
    color: '#EF5350',
    cursor: 'pointer',
    fontSize: 13,
    padding: 0,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
};

export default function ImageUpload({ files, onFilesChange, file, onFileChange, multiple = false }) {
  const inputRef = useRef();
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  // Support legacy single-file props (file/onFileChange) and new multi-file props (files/onFilesChange)
  const isLegacy = !multiple && onFileChange;
  const actualFiles = isLegacy ? file : files;
  const actualOnChange = isLegacy ? onFileChange : onFilesChange;

  // Support both single file (legacy) and multiple files
  const fileList = multiple ? (actualFiles || []) : (actualFiles ? [actualFiles] : []);

  const handleChange = (e) => {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;
    if (multiple) {
      actualOnChange([...fileList, ...selected]);
    } else {
      actualOnChange(selected[0] || null);
    }
    // Reset input so re-selecting same file works
    e.target.value = '';
  };

  const handleRemove = (index) => {
    if (multiple) {
      const next = fileList.filter((_, i) => i !== index);
      actualOnChange(next);
    } else {
      actualOnChange(null);
      inputRef.current.value = '';
    }
  };

  const handleDragStart = (e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    setOverIndex(index);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const reordered = [...fileList];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    actualOnChange(reordered);
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div style={styles.container}>
      <label style={styles.label}>
        {multiple ? 'Imagenes (puedes seleccionar varias)' : 'Imagen (opcional)'}
      </label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        style={styles.input}
        onChange={handleChange}
      />
      {multiple && fileList.length > 1 && (
        <p style={styles.hint}>Arrastra las imagenes para cambiar el orden de publicacion</p>
      )}

      {fileList.length > 0 && (
        <div style={styles.previewGrid}>
          {fileList.map((file, i) => (
            <div
              key={`${file.name}-${file.size}-${i}`}
              draggable={multiple && fileList.length > 1}
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              onDragEnd={handleDragEnd}
              style={{
                ...styles.previewItem,
                ...(dragIndex === i ? styles.previewItemDragging : {}),
                ...(overIndex === i && dragIndex !== i ? styles.previewItemOver : {}),
              }}
            >
              {multiple && (
                <span style={styles.orderBadge}>{i + 1}</span>
              )}
              <img
                src={URL.createObjectURL(file)}
                alt={`Preview ${i + 1}`}
                style={styles.previewImage}
              />
              <button
                type="button"
                style={styles.removeBtn}
                onClick={() => handleRemove(i)}
                title="Quitar"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {multiple && fileList.length > 0 && (
        <button
          type="button"
          style={styles.clearBtn}
          onClick={() => {
            actualOnChange([]);
            inputRef.current.value = '';
          }}
        >
          Quitar todas las imagenes
        </button>
      )}
    </div>
  );
}
