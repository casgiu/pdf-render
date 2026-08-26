import fs from "fs";
import { pipeline } from "stream/promises";
import {
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

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

export async function checkObjectStorageHealth() {
  await getClient().send(new HeadBucketCommand({ Bucket: bucket() }));
}

export async function uploadFile(key, filePath, contentType) {
  // Upload choisit automatiquement le multipart pour les gros fichiers et
  // annule les parties incomplètes en cas d'erreur.
  await new Upload({
    client: getClient(),
    params: {
      Bucket: bucket(),
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    leavePartsOnError: false,
  }).done();
}

export async function getObjectBuffer(key) {
  const body = await getObjectStream(key);
  return Buffer.from(await body.transformToByteArray());
}

export async function getObjectStream(key) {
  const response = await getClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!response.Body) throw new Error("Le stockage objet a retourné un fichier vide.");
  return response.Body;
}

export async function downloadObjectToFile(key, destination) {
  await pipeline(await getObjectStream(key), fs.createWriteStream(destination));
}

export async function deleteObject(key) {
  if (!key) return;
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function listObjects(prefix) {
  const objects = [];
  let continuationToken;

  do {
    const page = await getClient().send(new ListObjectsV2Command({
      Bucket: bucket(),
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    objects.push(...(page.Contents || []));
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

export async function deleteObjects(keys) {
  for (let index = 0; index < keys.length; index += 1000) {
    const batch = keys.slice(index, index + 1000);
    await getClient().send(new DeleteObjectsCommand({
      Bucket: bucket(),
      Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
    }));
  }
}
