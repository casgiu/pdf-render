import fs from "fs";
import {
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`La variable d'environnement ${name} est requise pour le stockage objet.`);
  return value;
}

let client;

function getClient() {
  if (!client) {
    client = new S3Client({
      region: process.env.OBJECT_STORAGE_REGION || "auto",
      endpoint: required("OBJECT_STORAGE_ENDPOINT"),
      credentials: {
        accessKeyId: required("OBJECT_STORAGE_ACCESS_KEY_ID"),
        secretAccessKey: required("OBJECT_STORAGE_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

function bucket() {
  return required("OBJECT_STORAGE_BUCKET");
}

export async function uploadFile(key, filePath, contentType) {
  await getClient().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentType: contentType,
  }));
}

export async function getObjectBuffer(key) {
  const response = await getClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!response.Body) throw new Error("Le stockage objet a retourné un fichier vide.");
  return Buffer.from(await response.Body.transformToByteArray());
}

export async function downloadObjectToFile(key, destination) {
  const buffer = await getObjectBuffer(key);
  await fs.promises.writeFile(destination, buffer);
}

export async function deleteObject(key) {
  if (!key) return;
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
