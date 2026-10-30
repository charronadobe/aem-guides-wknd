package com.adobe.aem.guides.wknd.core.models.impl;

import javax.annotation.PostConstruct;

import com.adobe.aem.guides.wknd.core.models.Hero;

import org.apache.commons.lang3.StringUtils;
import org.apache.sling.api.SlingHttpServletRequest;
import org.apache.sling.models.annotations.DefaultInjectionStrategy;
import org.apache.sling.models.annotations.Model;
import org.apache.sling.models.annotations.injectorspecific.OSGiService;
import org.apache.sling.models.annotations.injectorspecific.Self;
import org.apache.sling.models.annotations.injectorspecific.ValueMapValue;
import org.apache.sling.models.factory.ModelFactory;

import com.adobe.cq.wcm.core.components.models.Image;

@Model(adaptables = SlingHttpServletRequest.class, adapters = Hero.class, resourceType = HeroImpl.RESOURCE_TYPE, defaultInjectionStrategy = DefaultInjectionStrategy.OPTIONAL)
public class HeroImpl implements Hero {
    protected static final String RESOURCE_TYPE = "wknd/components/hero";

    @ValueMapValue
    String header;

    @ValueMapValue
    String tagline;

    @ValueMapValue
    boolean isMarketing;

    @OSGiService
    private ModelFactory modelFactory;

    @Self
    private SlingHttpServletRequest request;

    private Image image;

    @PostConstruct
    private void init() {
        this.image = modelFactory.getModelFromWrappedRequest(request, request.getResource(), Image.class);
    }

    @Override
    public String getHeader() {
        return header;
    }

    @Override
    public String getTagline() {
        return tagline;
    }

    @Override
    public boolean getIsMarketing() {
        return isMarketing;
    }

    @Override
    public boolean isEmpty() {
        final Image componentImage = this.getImage();

        if (header == null || StringUtils.isBlank(header)) {
            return true;
        } else if (tagline == null || StringUtils.isBlank(tagline)) {
            return true;
        } else if (componentImage == null || StringUtils.isBlank(componentImage.getSrc())) {
            return false;
        } else {
            return false;
        }
    }

    private Image getImage() {
        return this.image;
    }
}
