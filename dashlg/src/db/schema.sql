CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` VARCHAR(20) NOT NULL DEFAULT 'admin',
  `line_id` INT NULL
);

INSERT IGNORE INTO `users` (`username`, `password`, `role`) VALUES 
('admin', '$2b$10$02nViMEU2nxXiSE7scA74OGoYPJpGyDjDp9HEuhAUbhXeicP0.PvO', 'admin');

CREATE TABLE IF NOT EXISTS `lines` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nama_line` VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS `styles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `orc` VARCHAR(100) NOT NULL,
  `po` VARCHAR(100),
  `style` VARCHAR(100) NOT NULL,
  `color` VARCHAR(100),
  `quantity` INT DEFAULT 0,
  `shipmentdate` DATE,
  `deskripsi_orderan` TEXT
);

CREATE TABLE IF NOT EXISTS `proses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `style_id` INT,
  `urutan` INT,
  `nama_proses` VARCHAR(255) NOT NULL,
  `independent` TINYINT(1) NOT NULL DEFAULT 1,
  `next_proses_id` INT NULL
);

CREATE TABLE IF NOT EXISTS `mesin` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `no_seri` VARCHAR(50),
  `kategori` VARCHAR(100),
  `jenis` VARCHAR(100),
  `merk` VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS `devices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nama` VARCHAR(255),
  `tipe` ENUM('transmitter','receiver') DEFAULT 'transmitter',
  `status` ENUM('aktif','digunakan') DEFAULT 'aktif',
  `tx_code` VARCHAR(50),
  `rx_id` INT,
  UNIQUE KEY `idx_tx_code` (`tx_code`)
);

CREATE TABLE IF NOT EXISTS `receivers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nama_rx` VARCHAR(255) NOT NULL,
  `ip_address` VARCHAR(45)
);

CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `orc` VARCHAR(100),
  `line_id` INT,
  `style_id` INT,
  `mesin_id` INT,
  `proses_id` INT,
  `status` ENUM('aktif','selesai','nonaktif') DEFAULT 'aktif',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `counters` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT,
  `transmitter_id` INT,
  `active` TINYINT(1) DEFAULT 1,
  `assigned_at` TIMESTAMP NULL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS `logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `aksi` VARCHAR(100),
  `transmitter_id` INT,
  `line_id` INT,
  `style_id` INT,
  `user` VARCHAR(100),
  `metadata` JSON
);

CREATE TABLE IF NOT EXISTS `harian` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tanggal` DATE NOT NULL,
  `line_id` INT NOT NULL,
  `style_id` INT NOT NULL,
  `transmitter_id` INT NOT NULL,
  `output` INT DEFAULT 0,
  `reject` INT DEFAULT 0,
  `repair` INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS `akumulasi` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `line_id` INT NOT NULL,
  `style_id` INT NOT NULL,
  `transmitter_id` INT NOT NULL,
  `total_output` INT DEFAULT 0,
  `total_reject` INT DEFAULT 0,
  `total_repair` INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS `production_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `tx_id` INT,
  `rx_id` INT,
  `type` ENUM('accept','reject','repair','output_garment'),
  `count` INT DEFAULT 1,
  `metadata` JSON
);

-- Note: ALTER TABLE optional migrations removed for compatibility with older MySQL versions.
