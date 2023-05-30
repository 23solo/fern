import { FernToken } from "@fern-api/auth";
import { combineAudiences } from "@fern-api/config-management-commons";
import { assertNever, entries } from "@fern-api/core-utils";
import { DocsNavigationItem, LogoReference } from "@fern-api/docs-configuration";
import { AbsoluteFilePath, relative, RelativeFilePath } from "@fern-api/fs-utils";
import { GeneratorGroup } from "@fern-api/generators-configuration";
import { registerApi } from "@fern-api/register";
import { createFdrService } from "@fern-api/services";
import { TaskContext } from "@fern-api/task-context";
import { DocsDefinition, FernWorkspace } from "@fern-api/workspace-loader";
import { FernRegistry } from "@fern-fern/registry-node";
import axios from "axios";
import chalk from "chalk";
import { readFile } from "fs/promises";

export async function publishDocs({
    token,
    organization,
    docsDefinition,
    domain,
    workspace,
    context,
    generatorGroup,
    version,
}: {
    token: FernToken;
    organization: string;
    docsDefinition: DocsDefinition;
    domain: string;
    workspace: FernWorkspace;
    context: TaskContext;
    generatorGroup: GeneratorGroup;
    version: string | undefined;
}): Promise<void> {
    const fdr = createFdrService({ token: token.value });

    const filepathsToUpload = getFilepathsToUpload(docsDefinition);

    const startDocsRegisterResponse = await fdr.docs.v1.write.startDocsRegister({
        domain,
        orgId: FernRegistry.OrgId(organization),
        filepaths: filepathsToUpload.map((filepath) => convertAbsoluteFilepathToFdrFilepath(filepath, docsDefinition)),
    });

    if (!startDocsRegisterResponse.ok) {
        return startDocsRegisterResponse.error._visit<never>({
            _other: (error) => {
                return context.failAndThrow("Failed to publish docs.", error);
            },
        });
    }

    const { docsRegistrationId, uploadUrls } = startDocsRegisterResponse.body;

    await Promise.all(
        filepathsToUpload.map(async (filepathToUpload) => {
            const uploadUrl = uploadUrls[convertAbsoluteFilepathToFdrFilepath(filepathToUpload, docsDefinition)];
            if (uploadUrl == null) {
                context.failAndThrow(`Failed to upload ${filepathToUpload}`, "Upload URL is missing");
            } else {
                await axios.put(uploadUrl.uploadUrl, await readFile(filepathToUpload), {
                    headers: {
                        "Content-Type": "application/octet-stream",
                    },
                });
            }
        })
    );

    const registerDocsResponse = await fdr.docs.v1.write.finishDocsRegister(
        docsRegistrationId,
        await constructRegisterDocsRequest({
            docsDefinition,
            organization,
            workspace,
            context,
            token,
            generatorGroup,
            uploadUrls,
            version,
        })
    );
    if (registerDocsResponse.ok) {
        context.logger.info(chalk.green("Published docs to " + domain));
    } else {
        registerDocsResponse.error._visit<never>({
            unauthorizedError: () => {
                return context.failAndThrow("Insufficient permissions. Failed to publish docs to " + domain);
            },
            userNotInOrgError: () => {
                return context.failAndThrow("Insufficient permissions. Failed to publish docs to " + domain);
            },
            docsRegistrationIdNotFound: () => {
                return context.failAndThrow(
                    "Failed to publish docs to " + domain,
                    `Docs registration ID ${docsRegistrationId} does not exist.`
                );
            },
            _other: (error) => {
                return context.failAndThrow("Failed to publish docs to " + domain, error);
            },
        });
        return context.failAndThrow();
    }
}

async function constructRegisterDocsRequest({
    docsDefinition,
    organization,
    workspace,
    context,
    token,
    generatorGroup,
    uploadUrls,
    version,
}: {
    docsDefinition: DocsDefinition;
    organization: string;
    workspace: FernWorkspace;
    context: TaskContext;
    token: FernToken;
    generatorGroup: GeneratorGroup;
    uploadUrls: Record<FernRegistry.docs.v1.write.FilePath, FernRegistry.docs.v1.write.FileS3UploadUrl>;
    version: string | undefined;
}): Promise<FernRegistry.docs.v1.write.RegisterDocsRequest> {
    return {
        docsDefinition: {
            pages: entries(docsDefinition.pages).reduce(
                (pages, [pageFilepath, pageContents]) => ({
                    ...pages,
                    [constructPageId(pageFilepath)]: { markdown: pageContents },
                }),
                {}
            ),
            config: await convertDocsConfiguration({
                docsDefinition,
                organization,
                workspace,
                context,
                token,
                generatorGroup,
                uploadUrls,
                version,
            }),
        },
    };
}

async function convertDocsConfiguration({
    docsDefinition,
    organization,
    workspace,
    context,
    token,
    generatorGroup,
    uploadUrls,
    version,
}: {
    docsDefinition: DocsDefinition;
    organization: string;
    workspace: FernWorkspace;
    context: TaskContext;
    token: FernToken;
    generatorGroup: GeneratorGroup;
    uploadUrls: Record<FernRegistry.docs.v1.write.FilePath, FernRegistry.docs.v1.write.FileS3UploadUrl>;
    version: string | undefined;
}): Promise<FernRegistry.docs.v1.write.DocsConfig> {
    return {
        logo:
            docsDefinition.config.logo != null
                ? await convertLogoReference({ logoReference: docsDefinition.config.logo, docsDefinition, uploadUrls })
                : undefined,
        navigation: {
            items: await Promise.all(
                docsDefinition.config.navigation.items.map((item) =>
                    convertNavigationItem({
                        item,
                        docsDefinition,
                        organization,
                        workspace,
                        context,
                        token,
                        generatorGroup,
                        version,
                    })
                )
            ),
        },
        colors: docsDefinition.config.colors,
    };
}

async function convertLogoReference({
    logoReference,
    docsDefinition,
    uploadUrls,
}: {
    logoReference: LogoReference;
    docsDefinition: DocsDefinition;
    uploadUrls: Record<FernRegistry.docs.v1.write.FilePath, FernRegistry.docs.v1.write.FileS3UploadUrl>;
}): Promise<FernRegistry.docs.v1.write.FileId | undefined> {
    switch (logoReference.type) {
        case "url":
            return undefined;
        case "file": {
            return uploadUrls[convertAbsoluteFilepathToFdrFilepath(logoReference.filepath, docsDefinition)]?.fileId;
        }
        default:
            assertNever(logoReference);
    }
}

async function convertNavigationItem({
    item,
    docsDefinition,
    organization,
    workspace,
    context,
    token,
    generatorGroup,
    version,
}: {
    item: DocsNavigationItem;
    docsDefinition: DocsDefinition;
    organization: string;
    workspace: FernWorkspace;
    context: TaskContext;
    token: FernToken;
    generatorGroup: GeneratorGroup;
    version: string | undefined;
}): Promise<FernRegistry.docs.v1.write.NavigationItem> {
    switch (item.type) {
        case "page":
            return FernRegistry.docs.v1.write.NavigationItem.page({
                title: item.title,
                id: constructPageId(relative(docsDefinition.absoluteFilepath, item.absolutePath)),
            });
        case "section":
            return FernRegistry.docs.v1.write.NavigationItem.section({
                title: item.title,
                items: await Promise.all(
                    item.contents.map((nestedItem) =>
                        convertNavigationItem({
                            item: nestedItem,
                            docsDefinition,
                            organization,
                            workspace,
                            context,
                            token,
                            generatorGroup,
                            version,
                        })
                    )
                ),
            });
        case "apiSection": {
            const apiDefinitionId = await registerApi({
                organization,
                workspace,
                context,
                token,
                audiences: combineAudiences(generatorGroup.audiences, item.audiences),
            });
            return FernRegistry.docs.v1.write.NavigationItem.api({
                title: item.title,
                api: apiDefinitionId,
                artifacts: constructArtifacts({ generatorGroup, version }),
            });
        }
        default:
            assertNever(item);
    }
}

function constructPageId(pathToPage: RelativeFilePath): FernRegistry.docs.v1.write.PageId {
    return FernRegistry.docs.v1.write.PageId(pathToPage);
}

function getFilepathsToUpload(docsDefinition: DocsDefinition): AbsoluteFilePath[] {
    const filepaths: AbsoluteFilePath[] = [];

    if (docsDefinition.config.logo != null) {
        switch (docsDefinition.config.logo.type) {
            case "file":
                filepaths.push(docsDefinition.config.logo.filepath);
                break;
            case "url":
                break;
            default:
                assertNever(docsDefinition.config.logo);
        }
    }

    return filepaths;
}

function convertAbsoluteFilepathToFdrFilepath(filepath: AbsoluteFilePath, docsDefinition: DocsDefinition) {
    return FernRegistry.docs.v1.write.FilePath(relative(docsDefinition.absoluteFilepath, filepath));
}

function constructArtifacts({
    generatorGroup,
    version,
}: {
    generatorGroup: GeneratorGroup;
    version: string | undefined;
}): FernRegistry.docs.v1.write.ApiArtifacts | undefined {
    if (version == null) {
        return undefined;
    }
    const sdks: FernRegistry.docs.v1.write.PublishedSdk[] = [];
    for (const generator of generatorGroup.generators) {
        if (generator.outputMode.type !== "github" || generator.outputMode.publishInfo == null) {
            continue;
        }

        const githubRepoName = `${generator.outputMode.owner}/${generator.outputMode.repo}`;
        const sdk = generator.outputMode.publishInfo._visit<FernRegistry.docs.v1.write.PublishedSdk | undefined>({
            npm: (npm) =>
                FernRegistry.docs.v1.write.PublishedSdk.npm({
                    packageName: npm.packageName,
                    githubRepoName,
                    version,
                }),
            maven: (maven) =>
                FernRegistry.docs.v1.write.PublishedSdk.maven({
                    coordinate: maven.coordinate,
                    githubRepoName,
                    version,
                }),
            pypi: (pypi) =>
                FernRegistry.docs.v1.write.PublishedSdk.pypi({
                    packageName: pypi.packageName,
                    githubRepoName,
                    version,
                }),
            postman: () => undefined,
            _other: () => undefined,
        });
        if (sdk != null) {
            sdks.push(sdk);
        }
    }

    return { sdks };
}