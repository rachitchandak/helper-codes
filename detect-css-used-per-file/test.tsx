/* Sample TSX component */
import React from 'react';
import styles from './App.module.css';

export const Button = () => {
    return (
        <button className="btn-primary" id="main-btn">
            <span className={styles.icon}>Icon</span>
            Click me
        </button>
    );
};
