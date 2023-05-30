import * as FernRegistryApiRead from "@fern-fern/registry-browser/api/resources/api/resources/v1/resources/read";
import classNames from "classnames";
import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { MonospaceText } from "../../commons/monospace/MonospaceText";
import { useDocsContext } from "../../docs-context/useDocsContext";
import { PageMargins } from "../../page-margins/PageMargins";
import { useApiPageContext } from "../api-page-context/useApiPageContext";
import { JsonPropertyPath } from "../examples/json-example/contexts/JsonPropertyPath";
import { Markdown } from "../markdown/Markdown";
import { useApiPageCenterElement } from "../useApiPageCenterElement";
import { useEndpointContext } from "./endpoint-context/useEndpointContext";
import { EndpointExamples } from "./endpoint-examples/EndpointExamples";
import { EndpointPathParameter } from "./EndpointPathParameter";
import { EndpointRequestSection } from "./EndpointRequestSection";
import { EndpointResponseSection } from "./EndpointResponseSection";
import { EndpointSection } from "./EndpointSection";
import { EndpointTitle } from "./EndpointTitle";
import { PathParametersSection } from "./PathParametersSection";
import { QueryParametersSection } from "./QueryParametersSection";

export declare namespace EndpointContent {
    export interface Props {
        endpoint: FernRegistryApiRead.EndpointDefinition;
        slug: string;
    }
}

export const EndpointContent: React.FC<EndpointContent.Props> = ({ endpoint, slug }) => {
    const isInitialMount = useRef(true);
    useLayoutEffect(() => {
        isInitialMount.current = false;
    }, []);

    const { setHoveredResponsePropertyPath } = useEndpointContext();
    const onHoverResponseProperty = useCallback(
        (jsonPropertyPath: JsonPropertyPath, { isHovering }: { isHovering: boolean }) => {
            setHoveredResponsePropertyPath(isHovering ? jsonPropertyPath : undefined);
        },
        [setHoveredResponsePropertyPath]
    );

    const { isInVerticalCenter, setTargetRef } = useApiPageCenterElement({ slug });
    const { onScrollToPath } = useDocsContext();
    const { containerRef: apiPageContainerRef } = useApiPageContext();
    useEffect(() => {
        if (!isInVerticalCenter) {
            return;
        }

        const handler = () => {
            onScrollToPath(slug);
        };
        apiPageContainerRef?.addEventListener("scroll", handler, false);
        return () => {
            apiPageContainerRef?.removeEventListener("scroll", handler);
        };
    }, [apiPageContainerRef, isInVerticalCenter, onScrollToPath, slug]);

    return (
        <PageMargins>
            <div className="flex min-w-0 flex-1 gap-20" ref={setTargetRef}>
                <div className="flex flex-1 flex-col">
                    <div className="pt-10 text-2xl font-semibold">
                        <EndpointTitle endpoint={endpoint} />
                    </div>
                    <div className="mt-6">
                        <div className="flex items-center gap-2 text-neutral-400">
                            <div className="rounded bg-neutral-400/20 px-2 py-1 font-semibold uppercase ">
                                {endpoint.method}
                            </div>
                            <div className="flex">
                                {endpoint.path.parts.map((part, index) => (
                                    <MonospaceText key={index}>
                                        {part._visit<JSX.Element | string | null>({
                                            literal: (literal) => literal,
                                            pathParameter: (pathParameter) => (
                                                <EndpointPathParameter pathParameter={pathParameter} />
                                            ),
                                            _other: () => null,
                                        })}
                                    </MonospaceText>
                                ))}
                            </div>
                        </div>
                    </div>
                    {endpoint.description != null && (
                        <div className="mt-6">
                            <Markdown>{endpoint.description}</Markdown>
                        </div>
                    )}
                    <div className="mt-8 flex">
                        <div className="flex flex-1 flex-col gap-12">
                            {endpoint.path.pathParameters.length > 0 && (
                                <PathParametersSection pathParameters={endpoint.path.pathParameters} />
                            )}
                            {endpoint.queryParameters.length > 0 && (
                                <QueryParametersSection queryParameters={endpoint.queryParameters} />
                            )}
                            {endpoint.request != null && (
                                <EndpointSection title="Request">
                                    <EndpointRequestSection httpRequest={endpoint.request} />
                                </EndpointSection>
                            )}
                            {endpoint.response != null && (
                                <EndpointSection title="Response">
                                    <EndpointResponseSection
                                        httpResponse={endpoint.response}
                                        onHoverProperty={onHoverResponseProperty}
                                    />
                                </EndpointSection>
                            )}
                        </div>
                    </div>
                </div>
                <div
                    className={classNames(
                        "flex-1 flex sticky self-start top-0 min-w-0",
                        // the 4rem is the same as the h-10 as the Header
                        "max-h-[calc(100vh-4rem)]"
                    )}
                >
                    <EndpointExamples endpoint={endpoint} />
                </div>
            </div>
        </PageMargins>
    );
};