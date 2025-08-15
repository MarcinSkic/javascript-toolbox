import { readdir } from "fs";
import { join } from "path";
import { exec as execCallback } from "child_process";
import { promisify } from "node:util";
import fs from "fs";

const exec = promisify(execCallback);

const directoryPath = process.argv[2];
const title = process.argv[3];
const studio = process.argv[4];
let season = Number.parseInt(process.argv[5]);
let episodesOffset = Number.parseInt(process.argv[6]);

let renameConflicts = 0;

if (Number.isNaN(season)) {
  season = 1;
}

if (Number.isNaN(episodesOffset)) {
  episodesOffset = 0;
}

if (!directoryPath || !title || !studio) {
  console.error(
    "Usage: node addMkvTags.js <directory-path> <title> <studio> <season(optionally, defaults to 1)>"
  );
  process.exit(1);
}

readdir(directoryPath, async (err, files) => {
  if (err) {
    console.error("Error reading directory:", err);
    return;
  }

  const mkvFiles = files.filter((file) => file.toLowerCase().endsWith(".mkv"));

  if (mkvFiles.length === 0) {
    console.log("No .mkv files found.");
    return;
  }

  const operations = mkvFiles.map(async (file, index) => {
    const filePath = join(directoryPath, file);
    const offsetIndex = index + episodesOffset;

    const paddedEpisodeCount = String(offsetIndex + 1).padStart(3, "0");
    const fullTitle = `${title} S0${season}E${paddedEpisodeCount}`;

    const editTitleCommand = `mkvpropedit "${filePath}" --edit info --set "title=${fullTitle}"`;
    await execCommand(editTitleCommand, file, "Updated title for");

    await editStudio(
      studio,
      offsetIndex,
      mkvFiles.length,
      directoryPath,
      filePath,
      file
    );

    const newFileName = `${fullTitle}.mkv`;
    const newFilePath = join(directoryPath, newFileName);

    if (mkvFiles.some((file) => file === newFileName)) {
      if (file !== newFileName) {
        console.warn(
          `Couldn't rename ${file}, there already exists file with target name ${newFileName}`
        );
        renameConflicts++;
      }

      return;
    }

    await fs.promises.rename(filePath, newFilePath, (renameErr) => {
      if (renameErr) {
        console.error(`Error renaming ${file}:`, renameErr.message);
        return;
      }
      console.log(`Renamed to: ${newFileName}`);
    });
  });

  await Promise.all(operations);

  if (renameConflicts !== 0) {
    console.warn(
      `Rename conflicts occurred (${renameConflicts})! If you used episodesOffset try running script a couple times, conflicts should decrease to 0`
    );
  }
});

async function editStudio(
  studio,
  index,
  filesCount,
  directoryPath,
  filePath,
  file
) {
  const xmlContent = `<Tags>
  <Tag>
    <Targets>
      <TargetTypeValue>30</TargetTypeValue>
    </Targets>
    <Simple>
      <Name>ARTIST</Name>
      <String>${studio}</String>
    </Simple>
    <Simple>
      <Name>PART_NUMBER</Name>
      <String>${index + 1}</String>
    </Simple>
    <Simple>
      <Name>TOTAL_PARTS</Name>
      <String>${filesCount + episodesOffset}</String>
    </Simple>
  </Tag>
</Tags>
  `;

  const tagsFilePath = join(directoryPath, `tags${index}.xml`);
  await fs.promises.writeFile(tagsFilePath, xmlContent, "utf8");

  const setTagsCommand = `mkvpropedit "${filePath}" --tags global:"${tagsFilePath}"`;
  await execCommand(setTagsCommand, file, "Updated artist for");

  await fs.promises.unlink(tagsFilePath, (unlinkErr) => {
    if (unlinkErr) {
      console.error(`Error deleting tags.xml:`, unlinkErr.message);
    }
  });
}

async function execCommand(command, fileName, successMessage) {
  try {
    const { stderr } = await exec(command);

    if (stderr) {
      throw new Error(`Warning for ${fileName}:`, stderr);
    }
  } catch (error) {
    console.error(`Error editing ${fileName}:`, error.message);
    return;
  }

  console.log(`${successMessage}: ${fileName}`);
}
