FROM alpine:3.22

ARG PB_VERSION=0.40.4
ARG PB_SHA256=9042ec818570e79c3628dadcd0a756c1496d9e1173918ec409d133c02f82e5fa

RUN apk add --no-cache ca-certificates unzip \
    && addgroup -S pocketbase \
    && adduser -S -G pocketbase -h /pb pocketbase

ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pocketbase.zip
RUN echo "${PB_SHA256}  /tmp/pocketbase.zip" | sha256sum -c - \
    && unzip /tmp/pocketbase.zip -d /pb \
    && rm /tmp/pocketbase.zip \
    && mkdir -p /pb/pb_data \
    && chown -R pocketbase:pocketbase /pb

COPY --chown=pocketbase:pocketbase pb_hooks /pb/pb_hooks
COPY --chown=pocketbase:pocketbase pb_migrations /pb/pb_migrations

USER pocketbase
WORKDIR /pb
EXPOSE 8090
ENTRYPOINT ["/pb/pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--origins=https://keep.fishese.cc,https://appassets.androidplatform.net"]
