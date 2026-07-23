'use client';

import styles from './styles.module.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  return (
    <div className={styles.container}>
      <h4>&#169; {currentYear} Sallyan House. All rights reserved.</h4>
    </div>
  );
};

export default Footer;

