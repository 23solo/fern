import { AbsoluteFilePath, join, RelativeFilePath } from "@fern-api/fs-utils";
import { GenerationLanguage } from "@fern-api/generators-configuration";
import { readFile, rm } from "fs/promises";
import { runFernCli } from "../../utils/runFernCli";

export async function generateFdrApiDefinitionAsString({
    fixturePath,
    language,
    audiences,
    apiName,
    version,
}: {
    fixturePath: AbsoluteFilePath;
    language?: GenerationLanguage;
    audiences?: string[];
    apiName?: string;
    version?: string;
}): Promise<string> {
    const fdrOutputPath = join(fixturePath, RelativeFilePath.of("fdr.json"));
    await rm(fdrOutputPath, { force: true, recursive: true });

    const command = ["fdr", fdrOutputPath];
    if (language != null) {
        command.push("--language", language);
    }
    if (audiences != null) {
        command.push("--audience");
        for (const audience of audiences) {
            command.push(audience);
        }
    }
    if (apiName != null) {
        command.push("--api", apiName);
    }
    if (version != null) {
        command.push("--version", version);
    }

    await runFernCli(command, {
        cwd: fixturePath,
    });

    const fdrContents = await readFile(fdrOutputPath);
    return fdrContents.toString();
}
