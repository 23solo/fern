package com.fern;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fern.immutables.StagedBuilderStyle;
import org.immutables.value.Value;

@Value.Immutable
@StagedBuilderStyle
@JsonDeserialize(as = ImmutableHttpEndpointQueryParameter.class)
public interface HttpEndpointQueryParameter extends IWithDocs {

    String key();

    TypeReference valueType();

    static ImmutableHttpEndpointQueryParameter.KeyBuildStage builder() {
        return ImmutableHttpEndpointQueryParameter.builder();
    }
}