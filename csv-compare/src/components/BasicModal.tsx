import React, { useCallback } from 'react';
import {
  Button,
  ButtonGroup,
  ModalProps,
  ModalCloseButton,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Modal,
  Box,
} from '@chakra-ui/react';

interface BasicModalProps extends Omit<ModalProps, 'onClose'> {
  onCancel: () => void;
  handleConfirm: () => void;
  title: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  disableConfirm?: boolean;
}

const BasicModal: React.FC<React.PropsWithChildren<BasicModalProps>> = ({
  children,
  onCancel,
  handleConfirm,
  cancelButtonText,
  confirmButtonText,
  disableConfirm,
  title,
  isOpen,
  ...modalProps
}) => {
  const onConfirm = useCallback((): void => {
    handleConfirm();
    onCancel();
  }, [onCancel, handleConfirm]);

  return (
    <Modal isOpen={isOpen} onClose={onCancel} size="md" {...modalProps}>
      <ModalOverlay />
      <ModalContent display="table">
        <ModalHeader>{title}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Box>{children}</Box>
        </ModalBody>
        <ModalFooter
          display="flex"
          justifyContent="space-between"
          alignContent="center"
        >
          <Box />
          <ButtonGroup>
            <Button variant="secondary" onClick={onCancel}>
              {cancelButtonText}
            </Button>
            <Button isDisabled={disableConfirm} onClick={onConfirm}>
              {confirmButtonText}
            </Button>
          </ButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default BasicModal;
