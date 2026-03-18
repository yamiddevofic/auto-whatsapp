import React, { useRef } from 'react';

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
  preview: {
    marginTop: 8,
    maxWidth: 200,
    maxHeight: 150,
    borderRadius: 6,
    border: '1px solid #ddd',
  },
  removeBtn: {
    display: 'block',
    marginTop: 4,
    background: 'none',
    border: 'none',
    color: '#EF5350',
    cursor: 'pointer',
    fontSize: 13,
    padding: 0,
  },
};

export default function ImageUpload({ file, onFileChange }) {
  const inputRef = useRef();

  const preview = file ? URL.createObjectURL(file) : null;

  return (
    <div style={styles.container}>
      <label style={styles.label}>Imagen (opcional)</label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={styles.input}
        onChange={(e) => onFileChange(e.target.files[0] || null)}
      />
      {preview && (
        <>
          <img src={preview} alt="Preview" style={styles.preview} />
          <button
            type="button"
            style={styles.removeBtn}
            onClick={() => {
              onFileChange(null);
              inputRef.current.value = '';
            }}
          >
            Quitar imagen
          </button>
        </>
      )}
    </div>
  );
}
