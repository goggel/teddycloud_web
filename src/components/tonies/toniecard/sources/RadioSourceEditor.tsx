import { Form, Input, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { RadioSourceProfile } from "../../../../types/audioSourceTypes";
import { RadioStreamSearch } from "../search/RadioStreamSearch";

export const RadioSourceEditor = ({
    profile,
    onChange,
    searchKey,
}: {
    profile: RadioSourceProfile;
    onChange: (profile: RadioSourceProfile) => void;
    searchKey?: number;
}) => {
    const { t } = useTranslation();
    return (
        <Space orientation="vertical" style={{ width: "100%" }}>
            <Typography.Text strong>
                {profile.displayName || profile.source || t("sources.noStation")}
            </Typography.Text>
            <Form.Item label={t("sources.radioUrl")}>
                <Input
                    aria-label={t("sources.radioUrl")}
                    value={profile.source}
                    onChange={(event) => onChange({ source: event.target.value, displayName: "" })}
                />
            </Form.Item>
            <Form.Item label={t("sources.stationName")}>
                <Input
                    aria-label={t("sources.stationName")}
                    value={profile.displayName || ""}
                    maxLength={512}
                    onChange={(event) => onChange({ ...profile, displayName: event.target.value })}
                />
            </Form.Item>
            <RadioStreamSearch
                key={searchKey}
                placeholder={t("tonies.editModal.placeholderSearchForARadioStream")}
                onChange={(source) => onChange({ source, displayName: "" })}
                onSelectResult={({ value, name }) => onChange({ source: value, displayName: name })}
            />
        </Space>
    );
};
