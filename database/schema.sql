-- SecretGift – esquema de base de datos (MySQL 8 / MariaDB 10.5+)
CREATE DATABASE IF NOT EXISTS secretgift CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE secretgift;

CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(80)  NOT NULL,
  correo        VARCHAR(254) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  verificado    TINYINT(1)   NOT NULL DEFAULT 0,
  estado        VARCHAR(10)  NOT NULL DEFAULT 'activo',   -- 'activo' | 'inactivo' (cuenta eliminada)
  desactivado_en DATETIME    NULL,                          -- cuándo se eliminó (se borra definitivamente a los 30 días)
  creado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuarios_correo (correo)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS codigos_verificacion (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  tipo        VARCHAR(12)  NOT NULL DEFAULT 'verificar',   -- 'verificar' | 'recuperar'
  codigo_hash CHAR(64)     NOT NULL,
  expira_en   DATETIME     NOT NULL,
  intentos    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  usado       TINYINT(1)   NOT NULL DEFAULT 0,
  creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_codigos_usuario (usuario_id),
  CONSTRAINT fk_codigos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS intercambios (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(80)  NOT NULL,
  fecha       DATE         NOT NULL,
  presupuesto DECIMAL(10,2) NOT NULL,
  creador_id  INT UNSIGNED NOT NULL,
  sorteado    TINYINT(1)   NOT NULL DEFAULT 0,
  codigo_invitacion VARCHAR(32) NOT NULL,   -- va en el link de invitación
  creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_intercambios_invitacion (codigo_invitacion),
  KEY idx_intercambios_creador (creador_id),
  CONSTRAINT fk_intercambios_creador FOREIGN KEY (creador_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS participantes (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  intercambio_id INT UNSIGNED NOT NULL,
  nombre         VARCHAR(80)  NOT NULL,
  correo         VARCHAR(254) NOT NULL,
  creado_en      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_participante_correo (intercambio_id, correo),
  CONSTRAINT fk_participantes_intercambio FOREIGN KEY (intercambio_id) REFERENCES intercambios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS asignaciones (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  intercambio_id  INT UNSIGNED NOT NULL,
  participante_id INT UNSIGNED NOT NULL,   -- quien regala
  asignado_id     INT UNSIGNED NOT NULL,   -- a quien le regala
  UNIQUE KEY uq_asignacion_da (intercambio_id, participante_id),
  UNIQUE KEY uq_asignacion_recibe (intercambio_id, asignado_id),
  CONSTRAINT fk_asig_intercambio FOREIGN KEY (intercambio_id)  REFERENCES intercambios(id)  ON DELETE CASCADE,
  CONSTRAINT fk_asig_da          FOREIGN KEY (participante_id) REFERENCES participantes(id) ON DELETE CASCADE,
  CONSTRAINT fk_asig_recibe      FOREIGN KEY (asignado_id)     REFERENCES participantes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS deseos (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  participante_id INT UNSIGNED NOT NULL,
  texto           VARCHAR(60)  NOT NULL,
  creado_en       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_deseos_participante (participante_id),
  CONSTRAINT fk_deseos_participante FOREIGN KEY (participante_id) REFERENCES participantes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tokens de Firebase Cloud Messaging (notificaciones push) de cada dispositivo
CREATE TABLE IF NOT EXISTS dispositivos_fcm (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  token      VARCHAR(255) NOT NULL,
  plataforma VARCHAR(12)  NOT NULL DEFAULT 'android',
  creado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fcm_token (token),
  KEY idx_fcm_usuario (usuario_id),
  CONSTRAINT fk_fcm_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
